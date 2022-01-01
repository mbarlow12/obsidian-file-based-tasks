// import * as crypto from "crypto";

export const hash = async (arg: unknown) => {
    let data: string = '';
    if (typeof arg !== 'string') {
        data = JSON.stringify(arg);
    }
    else {
        data = arg;
    }
    const message = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', message);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hex;
}