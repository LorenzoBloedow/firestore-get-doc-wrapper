## What is this travesty?
It's simply a powerful wrapper around the [getDoc method from firebase/firestore](https://firebase.google.com/docs/reference/js/firestore_#getdoc)!

## What can it do?
It currently supports automatic or configured caching and automatic retries.
Basically, you can set a persistent cache time for a document and have it be enforced globally whenever you use ```getDocWrapper``` or you can set a one-time cache for one specific request, or you can completely bypass both!<br />
You can also choose to retry a request a maximum amount of times, with or without a delay, or even only on [specific Firestore errors](https://firebase.google.com/docs/reference/android/com/google/firebase/firestore/FirebaseFirestoreException.Code)!

## Usage

    const docData = await getDocWrapper(db, "path/to/your/document", {
	    cacheOptions: {
		    enabled: true,
		    cacheTime: {
			    locked: true,
			    time: 70000,
			    bypassLockedTime: false
			},
			forceRefresh: false
	    },
	    retryOptions: {
		    enabled: true,
		    maxRetries: 7,
		    retryDelay: 5000,
		    retryOnErrorCode: ["deadline-exceeded"]
	    }
	}

## Parameters
TO-DO but they're pretty self-explanatory, and there's a JSDoc for the function explaning the different cache types.



## Troubleshooting
If `getDocWrapper` isn't retrying on specific errors make sure you are using them as they come from Firebase, i.e: lower-case letters and hyphens instead of upper-case letters and underscores.
This can be easily implemented but currently there's no need to as I only built this library for personal use, if it starts to gain some traction, I'll be happy to do it!