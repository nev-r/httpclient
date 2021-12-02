//
// HTTPCLIENT UTILS
//
let timesThrottled = 0;
export function createHttpClient(apiKey, withCredentials, options = {}, 
/**
 * an override mostly used for OAuth. don't worry about this:
 * to use this, you should have fetch attached to the window or global objects
 */
fetchFunctionOverride = fetch) {
    let fetchFunction = fetchFunctionOverride;
    globalThis;
    if (options.withWarningTimeout) {
        const { onTimeout, timeout } = options.withWarningTimeout;
        const oldFetchFunction = fetchFunction;
        // replace the fetcher this client will use
        fetchFunction = async (...[input, init]) => {
            const startTime = Date.now();
            const timer = setTimeout(() => onTimeout(startTime, timeout), timeout);
            try {
                return await oldFetchFunction(input, init);
            }
            finally {
                if (timer !== undefined) {
                    clearTimeout(timer);
                }
            }
        };
    }
    if (options.withAbortTimeout) {
        const { onTimeout, timeout } = options.withAbortTimeout;
        const oldFetchFunction = fetchFunction;
        // replace the fetcher this client will use
        fetchFunction = async (...[input, init]) => {
            const controller = typeof AbortController === "function" ? new AbortController() : null;
            const signal = controller?.signal;
            let timer = undefined;
            const startTime = Date.now();
            if (controller) {
                timer = setTimeout(() => {
                    controller.abort();
                    onTimeout?.(startTime, timeout);
                }, timeout);
                if (typeof input === "string") {
                    input = new Request(input);
                }
                init = { ...init, signal };
            }
            try {
                return await oldFetchFunction(input, init);
            }
            finally {
                if (timer !== undefined) {
                    clearTimeout(timer);
                }
            }
        };
    }
    // set up the base httpClient
    let httpClient = async (config) => {
        let url = config.url;
        if (config.params) {
            // strip out undefined params keys. bungie-api-ts creates them for optional endpoint parameters
            for (const key in config.params) {
                typeof config.params[key] === "undefined" && delete config.params[key];
            }
            url = `${url}?${new URLSearchParams(config.params).toString()}`;
        }
        const fetchOptions = new Request(url, {
            method: config.method,
            body: config.body ? JSON.stringify(config.body) : undefined,
            headers: config.body
                ? {
                    "X-API-Key": apiKey,
                    "Content-Type": "application/json",
                }
                : {
                    "X-API-Key": apiKey,
                },
            credentials: withCredentials ? "include" : "omit",
        });
        const response = await fetchFunction(fetchOptions);
        const data = await response.json();
        // try throwing bungie errors, which have more information, first
        maybeThrowBungieError(data, fetchOptions);
        // then throw errors on generic http error codes
        maybeThrowHttpError(response);
        return data;
    };
    // enable responsive throttling, unless disabled.
    // this wraps around the base httpClient, interpreting some of its responses
    if (options.responsiveThrottling ?? true) {
        const baseHttpClient = httpClient;
        httpClient = async (config) => {
            if (timesThrottled > 0) {
                // Double the wait time, starting with 1 second, until we reach 5 minutes.
                const waitTime = Math.min(5 * 60 * 1000, Math.pow(2, timesThrottled) * 500);
                console.log(`Throttled ${timesThrottled} times, waiting ${waitTime} ms before calling ${config.url}`);
                await sleep(waitTime);
            }
            try {
                const result = await baseHttpClient(config);
                // Quickly heal from being throttled
                timesThrottled = Math.floor(timesThrottled / 2);
                return result;
            }
            catch (e) {
                switch (e.code) {
                    case 35 /* ThrottleLimitExceededMinutes */:
                    case 36 /* ThrottleLimitExceededMomentarily */:
                    case 37 /* ThrottleLimitExceededSeconds */:
                    case 1672 /* DestinyThrottledByGameServer */:
                    case 54 /* PerApplicationThrottleExceeded */:
                    case 55 /* PerApplicationAnonymousThrottleExceeded */:
                    case 56 /* PerApplicationAuthenticatedThrottleExceeded */:
                    case 57 /* PerUserThrottleExceeded */:
                    case 5 /* SystemDisabled */:
                        timesThrottled++;
                        break;
                }
                throw e;
            }
        };
    }
    return httpClient;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * an error indicating a non-200 response code
 */
export class HttpStatusError extends Error {
    constructor(response) {
        super(response.statusText);
        this.status = response.status;
    }
}
/**
 * an error indicating the Bungie API sent back a parseable response,
 * and that response indicated the request was not successful
 */
export class BungieError extends Error {
    constructor(response, request) {
        super(response.Message);
        this.name = "BungieError";
        this.code = response.ErrorCode;
        this.status = response.ErrorStatus;
        this.endpoint = request.url;
    }
}
/**
 * this is a non-affecting pass-through for successful http requests,
 * but throws JS errors for a non-200 response
 */
function maybeThrowHttpError(response) {
    if (response.status < 200 || response.status >= 400) {
        throw new HttpStatusError(response);
    }
    return response;
}
/**
 * sometimes what you have looks like a Response but it's actually an Error
 *
 * this is a non-affecting pass-through for successful API interactions,
 * but throws JS errors for "successful" fetches with Bungie error information
 */
function maybeThrowBungieError(serverResponse, request) {
    // There's an alternate error response that can be returned during maintenance
    const eMessage = serverResponse &&
        serverResponse.error &&
        serverResponse.error_description;
    if (eMessage) {
        throw new BungieError({
            Message: eMessage,
            ErrorCode: 1618 /* DestinyUnexpectedError */,
            ErrorStatus: eMessage,
        }, request);
    }
    if (serverResponse.ErrorCode !== 1 /* Success */) {
        throw new BungieError(serverResponse, request);
    }
    return serverResponse;
}
