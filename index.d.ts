import { PlatformErrorCodes, ServerResponse } from "bungie-api-ts/common";
import { HttpClient } from "bungie-api-ts/http";
export declare function createHttpClient(apiKey: string, options?: {
    /**
     * always ON, unless explicitly set to false. this backs off increasingly,
     * delaying new api requests as previous ones encounter downtime or throttling responses.
     *
     * this will not automatically retry, the error is still passed upstack.
     * this simply decreases chances of encountering repeated errors.
     */
    responsiveThrottling?: boolean;
    /**
     * if set, this client will abort the request after some time,
     * then run the onTimeout function to notify upstack of what happened
     */
    withAbortTimeout?: {
        timeout: number;
        onTimeout?: (startTime: number, timeout: number) => void;
    };
    /**
     * if set, this client will run the onTimeout function if the request is taking a long time,
     * e.g. generate a "still waiting!" notification
     */
    withWarningTimeout?: {
        timeout: number;
        onTimeout: (startTime: number, timeout: number) => void;
    };
    /**
     * an override used to inject a fetch-like function with OAuth already set up.
     * regardless, you should really have fetch attached to the window or global object
     */
    fetchFunctionOverride?: typeof fetch;
}): HttpClient;
/**
 * an error indicating a non-200 response code
 */
export declare class HttpStatusError extends Error {
    status: number;
    constructor(response: Response);
}
/**
 * an error indicating the Bungie API sent back a parseable response,
 * and that response indicated the request was not successful
 */
export declare class BungieError extends Error {
    code?: PlatformErrorCodes;
    status?: string;
    endpoint: string;
    constructor(response: Partial<ServerResponse<any>>, request: Request);
}
