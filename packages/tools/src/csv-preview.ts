import Papa from 'papaparse';
export function csvPreview(text: string) {
    return Papa.parse<Record<string, string>>(text, {
        header: true,
        preview: 51,
        skipEmptyLines: 'greedy',
    });
}
