export const getRedditUrl = (permalink: string) => {
    if (permalink.startsWith("https://reddit.com")) {
        return permalink;
    }

    return `https://reddit.com${permalink}`;
}