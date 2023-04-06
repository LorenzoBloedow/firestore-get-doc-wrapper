import "fake-indexeddb/auto";
import getDocWrapper from "../src/index";
import { clear, createStore, get } from "idb-keyval";

type InternalCacheEntry = {
    doc: LooseObject | undefined,
    fetchedAt: number,
    persistentCacheTime?: number
}
type LooseObject = {
    [key: string]: any
}
const createDoc = (data: LooseObject | undefined) => ({ data() { return data } });

const testDocument = {
    testData: "test"
}

const changeTestDocument = (newData: string) => { testDocument.testData = newData; return testDocument; }
const resetTestDocument = () => testDocument.testData = "test";
const getInitialTestDocument  = () => ({ testData: "test" });
const firestoreWrapperCache = createStore("firestoreWrapperCache", "docs");

function fetchCacheDoc(path: string): Promise<InternalCacheEntry | undefined> {
    return new Promise((resolve, reject) => {

        get(path, firestoreWrapperCache)
        .then((cacheEntry: InternalCacheEntry | undefined) => {
            resolve(cacheEntry);
        })
        .catch(() => {
            reject("Error trying to fetch document from cache");
        })
    });
}
const getDocInternal = {
    retryCounter: 0
}
const cleanUpGetDocMock = () => getDocInternal.retryCounter = 0;

jest.mock("firebase/firestore", () => {
    const originalModule = jest.requireActual("firebase/firestore");

    return {
        __esModule: true,
        ...originalModule,
        doc: jest.fn((db, path) => {
            return path;
        }),
        getDoc: jest.fn((path) => {
            switch (path) {
                case "validRequest":
                    return Promise.resolve(createDoc(testDocument));
                case "invalidRequest":
                    return Promise.reject({
                        code: "test-error-code"
                    });
                case "validRequestAfterThreeRetries":
                    if (getDocInternal.retryCounter < 2) {
                        getDocInternal.retryCounter++;
                        return Promise.reject({
                            code: "test-error-code"
                        });
                    } else {
                        getDocInternal.retryCounter = 0;
                        return Promise.resolve(createDoc(testDocument));
                    }
                case "nonExistentDoc":
                    return Promise.resolve(createDoc(undefined));
            }
        })
    }
});

beforeEach(async () => {
    cleanUpGetDocMock();
    resetTestDocument();
    await clear(firestoreWrapperCache);
});

describe("getDocWrapper", () => {
    it("Will return document data without caching it", async () => {
        // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
        const result = await getDocWrapper(null, "validRequest");
        
        const cachedDoc = await fetchCacheDoc("validRequest");
        expect(cachedDoc).toBeUndefined();
        expect(result).toEqual(testDocument);
    });

    describe("Will cache the document data", () => {
        it("Will store the document data on the indexedDB cache", async () => {
            // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
            await getDocWrapper(null, "validRequest", {
                cacheOptions: {
                    enabled: true
                }
            });

            const cachedDoc = await fetchCacheDoc("validRequest");
            expect(cachedDoc?.doc).toEqual(testDocument);
        });

        describe("Will determine whether to use the cache or not based on the cache time", () => {
            it("Will overwrite the cache if the one-time cache time is stale", async () => {
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                await getDocWrapper(null, "validRequest", {
                    cacheOptions: {
                        enabled: true,
                        cacheTime: {
                            time: 0
                        }
                    }
                });
                await new Promise(resolve => setTimeout(resolve, 1));

                let cachedDoc = await fetchCacheDoc("validRequest");
                expect(cachedDoc?.doc).toEqual(testDocument);
    
                // Change the fresh data
                const alternativeTestDocument = changeTestDocument("test2");
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                await getDocWrapper(null, "validRequest", {
                    cacheOptions: {
                        enabled: true
                    }
                });
                cachedDoc = await fetchCacheDoc("validRequest");
                expect(cachedDoc?.doc).toEqual(alternativeTestDocument);
            });

            it("Will use the cache and not overwrite it if the one-time cache time is not stale", async () => {
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                await getDocWrapper(null, "validRequest", {
                    cacheOptions: {
                        enabled: true,
                    }
                });

                let cachedDoc = await fetchCacheDoc("validRequest");
                expect(cachedDoc?.doc).toEqual(testDocument);

                // Change the fresh data
                changeTestDocument("test2");
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                const result = await getDocWrapper(null, "validRequest", {
                    cacheOptions: {
                        enabled: true,
                        cacheTime: {
                            time: Number.POSITIVE_INFINITY
                        }
                    }
                });
                expect(result).toEqual(getInitialTestDocument());

                cachedDoc = await fetchCacheDoc("validRequest");
                expect(cachedDoc?.doc).toEqual(getInitialTestDocument());
            });

            it("Will use the cache if the persistent cache is NOT stale regardless of whether the one-time cache time is stale", async () => {
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                const firstResult = await getDocWrapper(null, "validRequest", {
                    cacheOptions: {
                        enabled: true,
                        cacheTime: {
                            time: Number.POSITIVE_INFINITY,
                            locked: true
                        }
                    }
                });

                expect(firstResult).toEqual(getInitialTestDocument());
                let cachedDoc = await fetchCacheDoc("validRequest");
                expect(cachedDoc?.doc).toEqual(testDocument);

                // Change the fresh data
                changeTestDocument("test2");
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                const secondResult = await getDocWrapper(null, "validRequest", {
                    cacheOptions: {
                        enabled: true,
                        cacheTime: {
                            time: 0
                        }
                    }
                });
                await new Promise(resolve => setTimeout(resolve, 1));
                // ONE-TIME CACHE IS NOW STALE BUT THE PERSISTENT CACHE IS NOT

                expect(secondResult).toEqual(getInitialTestDocument());
                cachedDoc = await fetchCacheDoc("validRequest");
                expect(cachedDoc?.doc).toEqual(getInitialTestDocument());
            });
            describe("Will determine whether to use the cache or not based on the cache options", () => {
                it("Will bypass the persistent cache time if cacheOptions.cacheTime.bypassLockedTime is set to true", async () => {
                    // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                    await getDocWrapper(null, "validRequest", {
                        cacheOptions: {
                            enabled: true,
                            cacheTime: {
                                time: Number.POSITIVE_INFINITY,
                                locked: true
                            }
                        }
                    });

                    let cachedDoc = await fetchCacheDoc("validRequest");
                    expect(cachedDoc?.doc).toEqual(testDocument);

                    // Change the fresh data
                    changeTestDocument("test2");
                    // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                    const result = await getDocWrapper(null, "validRequest", {
                        cacheOptions: {
                            enabled: true,
                            cacheTime: {
                                time: 0,
                                bypassLockedTime: true
                            }
                        }
                    });
                    await new Promise(resolve => setTimeout(resolve, 1));
                    // ONE-TIME CACHE IS NOW STALE BUT THE PERSISTENT CACHE IS NOT, HOWEVER, THE PERSISTENT CACHE TIME IS BYPASSED

                    expect(result).toEqual(testDocument);

                    cachedDoc = await fetchCacheDoc("validRequest");
                    expect(cachedDoc?.doc).toEqual(testDocument);
                });

                it("Will ignore the one-time cache if forceRefresh is set to true", async () => {
                    // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                    await getDocWrapper(null, "validRequest", {
                        cacheOptions: {
                            enabled: true
                        }
                    });

                    let cachedDoc = await fetchCacheDoc("validRequest");
                    expect(cachedDoc?.doc).toEqual(testDocument);
        
                    // Change the fresh data
                    const alternativeTestDocument = changeTestDocument("test2");
                    // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                    const result = await getDocWrapper(null, "validRequest", {
                        cacheOptions: {
                            enabled: true,
                            cacheTime: {
                                time: Number.POSITIVE_INFINITY
                            },
                            forceRefresh: true
                        }
                    });

                    cachedDoc = await fetchCacheDoc("validRequest");
                    expect(cachedDoc?.doc).toEqual(alternativeTestDocument);
                    expect(result).toEqual(alternativeTestDocument);
                });

                it("Will ignore the persistent cache if forceRefresh is set to true", async () => {
                    // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                    await getDocWrapper(null, "validRequest", {
                        cacheOptions: {
                            enabled: true,
                            cacheTime: {
                                time: Number.POSITIVE_INFINITY,
                                locked: true
                            }
                        }
                    });

                    let cachedDoc = await fetchCacheDoc("validRequest");
                    expect(cachedDoc?.doc).toEqual(testDocument);
        
                    // Change the fresh data
                    const alternativeTestDocument = changeTestDocument("test2");
                    // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                    const result = await getDocWrapper(null, "validRequest", {
                        cacheOptions: {
                            enabled: true,
                            forceRefresh: true
                        }
                    });

                    cachedDoc = await fetchCacheDoc("validRequest");
                    expect(cachedDoc?.doc).toEqual(alternativeTestDocument);
                    expect(result).toEqual(alternativeTestDocument);
                });
            });
        });
    });

    describe("Will retry if the Firestore request fails", () => {
        it("Will not retry more than the maximum specified number of times and will always retry with error code list not set", async () => {
            expect.assertions(2);
            // calling getDoc on 'validRequestAfterThreeRetries' only gives a valid request after three retries,
            // so by setting the maxRetries to 2, the request should fail
            try {
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                await getDocWrapper(null, "validRequestAfterThreeRetries", {
                    retryOptions: {
                        enabled: true,
                        maxRetries: 2
                    }
                });
            } catch (err) {
                expect(err).toEqual({
                    code: "test-error-code"
                });
            }
            cleanUpGetDocMock();
            // calling getDoc on 'validRequestAfterThreeRetries' only gives a valid request after three retries,
            // so by setting the maxRetries to 3, the request should succeed
            // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
            const result = await getDocWrapper(null, "validRequestAfterThreeRetries", {
                retryOptions: {
                    enabled: true,
                    maxRetries: 3
                }
            });
            expect(result).toEqual(testDocument);
        });

        it("Will not retry if the error code is not in the list of error codes to retry on", async () => {
            expect.assertions(1);
            
            try {
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                await getDocWrapper(null, "validRequestAfterThreeRetries", {
                    retryOptions: {
                        enabled: true,
                        maxRetries: 5,
                        // The error code being tested actually returns 'test-error-code', so this should not retry
                        retryOnErrorCode: ["test-error-code-2"]
                    }
                });
            } catch (err) {
                expect(err.message).toBe("Firestore threw an error but its code was not in the list of error codes to retry on");
            }
        });

        it("Will retry if the error code is in the list of error codes to retry on", async () => {
            // calling getDoc on 'validRequestAfterThreeRetries' only gives a valid request after three retries,
            // so by setting the maxRetries to 3, the request should succeed
            // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
            const result = await getDocWrapper(null, "validRequestAfterThreeRetries", {
                retryOptions: {
                    enabled: true,
                    maxRetries: 3,
                    retryOnErrorCode: ["random-test-code", "another-test-code", "test-error-code", "yet-another-test-code"]
                }
            });
            expect(result).toEqual(testDocument);
        });

        it("Will not retry if retrying is disabled or not set", async () => {
            expect.assertions(1);
            
            try {
                // @ts-expect-error - Firestore is not being used in the mocked getDoc and doc methods
                await getDocWrapper(null, "validRequestAfterThreeRetries", {
                    retryOptions: {
                        // (Missing enabled property)
                        maxRetries: 10
                    }
                });
            } catch (err) {
                expect(err).toEqual({
                    code: "test-error-code"
                });
            }
        });

        it.todo("Will retry after the specified delay");
    });
});