import * as crypto from "crypto";

export const hash = async (arg: unknown) => {
    let data: string = '';
    if (typeof arg !== 'string') {
        data = JSON.stringify(arg);
    }
    else {
        data = arg;
    }
    const hash = crypto.createHash('sha1');
    const message = new TextEncoder().encode(data);
    hash.update(message);
    return hash.digest('hex');
}