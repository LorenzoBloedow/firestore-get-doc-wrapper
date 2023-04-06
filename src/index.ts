import { doc as docRef, DocumentData, DocumentSnapshot, Firestore, getDoc } from "firebase/firestore";
import { get, set, del, createStore } from "idb-keyval";

type LooseObject = {
    [key: string]: any
}

type CacheOptions = {
    enabled?: boolean,
    cacheTime?: {
        locked?: boolean,
        time?: number,
        bypassLockedTime?: boolean
    }
    forceRefresh?: boolean
}

type RetryOptions = {
    enabled?: boolean,
    maxRetries?: number,
    retryDelay?: number,
    retryOnErrorCode?: string[]
}

type Options = {
    cacheOptions?: CacheOptions,
    retryOptions?: RetryOptions
}

const timeout = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function requestDoc(db: Firestore, path: string, retryOptions?: RetryOptions): Promise<DocumentSnapshot<DocumentData>> {
    const retryDelay = retryOptions?.retryDelay || 0;
    const maxRetries = retryOptions?.maxRetries || 3;
    let retries = 0;
    
    async function request() {
        try {
            return await getDoc(docRef(db, path));
        } catch (err) {
            if (retryOptions?.enabled) {
                if (retries < (maxRetries - 1)) {
                    retries++;
                    if (!retryOptions?.retryOnErrorCode) {
                        await timeout(retryDelay);
                        return await request();
                        
                    } else if (retryOptions?.retryOnErrorCode?.includes(err?.code)) {
                        await timeout(retryDelay);
                        return await request();
                    } else {
                        throw new Error("Firestore threw an error but its code was not in the list of error codes to retry on");
                    }
                }
            }
            throw err;
        }
    }

    return request() as Promise<DocumentSnapshot<DocumentData>>;
}

/**
 * There are two types of caches, the one-time cache and the locked cache,
 * you can lock the cache time by setting the locked property to true.
 * or you can simply use a one-time cache by setting `cacheTime.time`
 * to an amount of time in milliseconds.
 * 
 * If the document you're querying currently has a locked cache time,
 * you can bypass it by setting `cacheOptions.cacheTime.bypassLockedTime` to `true`
 * to bypass it and use `cacheOptions.cacheTime.time` without setting a new locked cache time.
 * 
 * Or you can simply set a new locked cache time by setting both `cacheOptions.cacheTime.time` and
 * `cacheOptions.cacheTime.locked`, this will override the current locked cache time.
 * @throws Will throw if the Firestore document can't be fetched.
**/
function getDocWrapper(db: Firestore, path: string, options?: Options): Promise<LooseObject | undefined> {
    return new Promise(async (resolve, reject) => {
        const firestoreWrapperCache = createStore("firestoreWrapperCache", "docs");
        
        await get(path, firestoreWrapperCache)
        .then(async cacheEntry =>  {
            const persistentCacheTime = cacheEntry?.persistentCacheTime;
            if (!options?.cacheOptions?.enabled) {
                // ******** CACHE DISABLED ********
                if ((Date.now() - cacheEntry?.fetchedAt) < persistentCacheTime) {
                    resolve(cacheEntry?.doc);
                } else {
                    try {
                        const doc = await requestDoc(db, path, options?.retryOptions);
                        resolve(doc.data());
                    } catch (err) {
                        reject(err);
                    }
                }
                return;
            }

            // ******** CACHE ENABLED ********
            if (!cacheEntry) {
                // If the cache is empty, request a new document
                await requestDoc(db, path, options?.retryOptions)
                .then(doc => {
                    const newDocEntry: {
                        fetchedAt: number,
                        persistentCacheTime?: number
                        doc: LooseObject
                    } = {
                        fetchedAt: Date.now(),
                        doc: doc.data() as LooseObject
                    }

                    if (options?.cacheOptions?.cacheTime?.locked) {
                        newDocEntry.persistentCacheTime = options?.cacheOptions?.cacheTime?.time;
                    }

                    set(path, newDocEntry, firestoreWrapperCache);
                    resolve(doc.data());
                })
                .catch(err => {
                    reject(err);
                });
                return;
            }

            // If the user has choosen to force a refresh, clear the cache and request a new document
            // regardless of the cache time (locked or one-time) and whether bypassLocked time is set
            if (options?.cacheOptions?.forceRefresh) {
                await del(path, firestoreWrapperCache)
                .then(async () => {
                    await requestDoc(db, path, options?.retryOptions)
                    .then(newDoc => {
                        const newDocEntry: {
                            fetchedAt: number,
                            persistentCacheTime?: number
                            doc: LooseObject
                        } = {
                            fetchedAt: Date.now(),
                            doc: newDoc.data() as LooseObject
                        }
    
                        if (options?.cacheOptions?.cacheTime?.locked) {
                            newDocEntry.persistentCacheTime = options?.cacheOptions?.cacheTime?.time;
                        }
    
                        set(path, newDocEntry, firestoreWrapperCache);
                        resolve(newDoc.data());
                    });
                })
                .catch(err => {
                    reject(err);
                });
                return;
            }

            // If a locked cache time was set previously
            // and the user hasn't choosen to bypass it
            if (persistentCacheTime && !options?.cacheOptions?.cacheTime?.bypassLockedTime) {

                // If the user is overriding the previously
                // locked cache time by setting a new one
                if (options?.cacheOptions?.cacheTime?.locked) {

                    if ((Date.now() - cacheEntry?.fetchedAt) < options?.cacheOptions?.cacheTime?.time) {

                        resolve(cacheEntry?.doc);
                        return;
                    }
                
                // If the user is not overriding the previously locked cache time,
                // check against the previously locked cache time
                } else if ((Date.now() - cacheEntry?.fetchedAt) < persistentCacheTime) {

                    resolve(cacheEntry?.doc);
                    return;
                }
            
            // If a locked cache time was not set previously, or the user has choosen to override it,
            // check against the one-time cache time
            } else {

                if ((Date.now() - cacheEntry?.fetchedAt) < options?.cacheOptions?.cacheTime?.time) {
                    resolve(cacheEntry?.doc);
                    return;
                }
            }
            // If all the above conditions are false, it means either the cache is stale or it doesn't exist
            // So now we can request a new document from Firestore and store it in the cache
            await del(path, firestoreWrapperCache)
            .then(async () => {
                await requestDoc(db, path, options?.retryOptions)
                .then(newDoc => {
                    const newDocEntry: {
                        fetchedAt: number,
                        persistentCacheTime?: number
                        doc: LooseObject
                    } = {
                        fetchedAt: Date.now(),
                        doc: newDoc.data() as LooseObject
                    }
                    // If the user has choosen to lock the cache time, store it
                    if (options?.cacheOptions?.cacheTime?.locked) {
                        newDocEntry.persistentCacheTime = options?.cacheOptions?.cacheTime?.time;
                    }

                    set(path, newDocEntry, firestoreWrapperCache);
                    resolve(newDoc.data());
                });
            })
            .catch(err => {
                reject(err);
            });
        })
        .catch(err => {
            reject(err);
        });
    });
}

export default getDocWrapper;