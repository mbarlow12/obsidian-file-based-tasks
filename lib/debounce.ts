import Timeout = NodeJS.Timeout;

export function debounce(f: Function, wait: number) {
    let timeout: Timeout;
    return function (...args: unknown[]) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => f.apply(context, args), wait);
    }
}