import { net } from 'electron';
import { log } from './mainLogger';

/**
 * Fetches the title of a page from its URL.
 * Makes a GET request and parses the HTML to extract the <title> tag.
 * Falls back to the URL if the request fails or no title is found.
 *
 * @param url The URL to fetch the title from
 * @param timeoutMs Timeout in milliseconds (default: 5000)
 * @returns Promise resolving to the page title or URL as fallback
 */
export async function fetchPageTitle(url: string, timeoutMs: number = 5000): Promise<string> {
  log.debug(`[fetchPageTitle] Starting title fetch for: ${url}`, 'fetchPageTitle');

  try {
    // Create a promise that will timeout
    const fetchPromise = new Promise<string>((resolve, reject) => {
      const request = net.request(url);

      // Set a timeout
      const timeoutId = setTimeout(() => {
        request.abort();
        reject(new Error('Request timeout'));
      }, timeoutMs);

      let htmlData = '';
      let statusCode: number | undefined;

      request.on('response', (response) => {
        statusCode = response.statusCode;
        log.debug(`[fetchPageTitle] Response received: status=${statusCode}`, 'fetchPageTitle');

        // Only process successful responses
        if (statusCode && statusCode >= 200 && statusCode < 300) {
          response.on('data', (chunk) => {
            // Only accumulate first ~10KB to avoid memory issues
            if (htmlData.length < 10240) {
              htmlData += chunk.toString();

              // Check if we have enough data to find the title
              // Most titles are in the first few KB of HTML
              const titleMatch = htmlData.match(/<title[^>]*>([^<]*)<\/title>/i);
              if (titleMatch) {
                clearTimeout(timeoutId);
                request.abort();
                const title = titleMatch[1].trim();
                log.debug(`[fetchPageTitle] Title found: "${title}"`, 'fetchPageTitle');
                resolve(title);
              }
            }
          });

          response.on('end', () => {
            clearTimeout(timeoutId);

            // Try to extract title one more time from complete data
            const titleMatch = htmlData.match(/<title[^>]*>([^<]*)<\/title>/i);
            if (titleMatch) {
              const title = titleMatch[1].trim();
              log.debug(`[fetchPageTitle] Title found at end: "${title}"`, 'fetchPageTitle');
              resolve(title);
            } else {
              log.debug(`[fetchPageTitle] No title tag found in HTML`, 'fetchPageTitle');
              reject(new Error('No title found'));
            }
          });
        } else {
          clearTimeout(timeoutId);
          log.debug(`[fetchPageTitle] Non-success status code: ${statusCode}`, 'fetchPageTitle');
          reject(new Error(`HTTP ${statusCode}`));
        }
      });

      request.on('error', (error) => {
        clearTimeout(timeoutId);
        log.debug(`[fetchPageTitle] Request error: ${error.message}`, 'fetchPageTitle');
        reject(error);
      });

      // Start the request
      request.end();
    });

    const title = await fetchPromise;
    return title;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.debug(`[fetchPageTitle] Failed to fetch title, using URL as fallback. Error: ${errorMessage}`, 'fetchPageTitle');
    return url;
  }
}
