export const PLUGIN_NAME = 'file-based-tasks-obsidian';

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const FILE_1_CONTENTS =`
- [ ] task 1
- [x] task 2
- [ ] task [[with a link]] in it
- [ ] task with a #tag in it
- [ ] task with a due date @three days from now`;

export const FILE_2_CONTENTS = `- [ ] task 3

- [ ] task 4
    - [ ] task 5
        - [ ] task 6
        
- [ ] task 1`;