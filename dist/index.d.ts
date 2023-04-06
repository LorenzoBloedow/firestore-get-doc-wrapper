import { Firestore } from "firebase/firestore";
type LooseObject = {
    [key: string]: any;
};
type CacheOptions = {
    enabled?: boolean;
    cacheTime?: {
        locked?: boolean;
        time?: number;
        bypassLockedTime?: boolean;
    };
    forceRefresh?: boolean;
};
type RetryOptions = {
    enabled?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    retryOnErrorCode?: string[];
};
type Options = {
    cacheOptions?: CacheOptions;
    retryOptions?: RetryOptions;
};
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
declare function getDocWrapper(db: Firestore, path: string, options?: Options): Promise<LooseObject | undefined>;
export default getDocWrapper;
