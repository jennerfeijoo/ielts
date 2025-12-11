async function loadCards(areas) {
    let cards = [];

    for (const area of areas) {
        const response = await fetch(`data/${area}.txt`);
        const text = await response.text();

        const lines = text.split("\n")
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith("#"));

        for (const line of lines) {
            const parts = line.split(";");
            if (parts.length !== 4) continue;

            const [type, front, back, examples] = parts;

            cards.push({
                area,
                type,
                front,
                back,
                examples: examples.split("|")
            });
        }
    }

    return cards;
}
