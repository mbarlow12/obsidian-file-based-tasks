jest.mock('obsidian', () => {
    return {
        __esModule: true,
        default: jest.fn(() => true),
        stringifyYaml: jest.fn(obj => JSON.stringify(obj)),
        TFile: jest.fn((basename, ext) => ({ path: basename }))
    };
},
    {virtual: true});

export {}