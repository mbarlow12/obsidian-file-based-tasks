export const intersect = <T>(setA: Set<T>|Array<T>, setB: Set<T>|Array<T>): Set<T> => {
    const intersection: Set<T> = new Set();
    for (const itemA of setA) {
        if (itemA in setB) {
            intersection.add(itemA);
        }
    }
    return intersection;
}