import data from './TestData'

const bullets = ['-', '*'];

const invalidTaskLines = [
    '-[    invalid task 1',
    '-   x] invalid task 2',
    '- [x]            ',
    '[]',
]

export function todoTemplate(strings: TemplateStringsArray, ...keys: number[]) {
    return (...values: string[]): string => {
        values[0] = values[0] === 'x' ? 'x' : ' ';
        let result = [strings[0]];
        for (const [i, key] of keys.entries()) {
            let value = values[key];
            result.push(value, strings[i + 1])
        }
        return result.join('');
    }
}

const validHTask = todoTemplate`- [${0}] ${1}`;
const validATask = todoTemplate`* [${0}] ${1}`;

export const randInt = (min: number = 0, max: number = 15): number => {
    return Math.round(Math.random() * Math.abs(max - min) + Math.min(min, max))
}

export const createValidTaskLine = (name: string, isComplete: boolean): string => {
    const b = bullets[Math.round(Math.random())];
    const spaces: string[] = Array(randInt()).fill(' ');
    if (isComplete) {
        const xi = randInt(0, spaces.length);
        spaces.splice(xi, 0, 'x');
    }
    return `${b} [${spaces.join('')}] a valid task`;
}

export const createStrictValidTaskLine = (name: string, isComplete: boolean): string => {
    const b = isComplete ? 'x' : '';
    if (randInt(0, 1))
        return validATask(b, name);
    return validHTask(b, name);
}

export const createInvalidTaskLine = (name?: string): string => {
    const i = randInt(0, invalidTaskLines.length);
    return invalidTaskLines[i];
}

export const createTaskFileContents = (validCount: number = 10, invalidCount?: number) => {
    invalidCount ||= 0;
    const miscLines = data.fileContents;
    const validLines = Array(validCount).fill('').map((_, i) => createStrictValidTaskLine(`valid task ${i}`, i % 2 === 0))
    const invalidLines = Array(invalidCount).fill('').map(_ => createInvalidTaskLine())
    return shuffle<string>(miscLines.concat(validLines, invalidLines)).join('\n')
}

function shuffle<T>(a: Array<T>): Array<T> {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}
