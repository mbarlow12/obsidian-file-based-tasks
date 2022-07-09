
export const arraysEqual = <T>(a: T[], b: T[], comp: (a: T, b: T) => boolean = (a, b) => a === b ): boolean => {
    if (!a && !b)
        return true;
    if (!(a.length === b.length))
        return false;
    for ( let i = 0; i < a.length; i++ ) {
        const elemA = a[i];
        const elemB = b.find(bVal => comp(elemA, bVal));
        if (!elemB)
            return false;
    }
    return true;
}