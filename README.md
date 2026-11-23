# NZ Free Parking

NZ Free Parking is a static site for Auckland, Christchurch and Wellington. It uses HTML, CSS and browser JavaScript. It needs no build step, Python runtime or application server. Live council parking feeds and basemap tiles need internet access.

## Static hosting

The public site is served by GitHub Pages from the root of `main`. The `.nojekyll` file lets Pages serve the HTML, CSS and JavaScript as-is. [Open NZ Free Parking](https://omimanav.com/freeparking/)

Both pages request that compliant search engines exclude their content from results and snippets. For crawl restrictions, the supplied `robots.txt` belongs at the origin root. The copy under `/freeparking/` is outside that location. The origin-wide crawler policy is managed by the host. [Robots.txt guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro)

## Optional request blocking

The included JavaScript guard runs on Cloudflare Workers. GitHub Pages serves static files and has no request-time Worker runtime. To use the guard on a separate Cloudflare deployment, the Wrangler configuration routes requests through it before serving any static asset. The worker blocks requests from identifiable scraping and AI crawlers and limits other requests to 180 per minute per IP at each Cloudflare location. Rate-limited responses return HTTP 429. Pick a different rate-limit namespace ID if the account already uses the configured ID for an unrelated Worker. [Static asset routing](https://developers.cloudflare.com/workers/static-assets/binding/) · [Rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

```sh
npx wrangler deploy
```

Keep public site traffic behind the Worker for these limits to apply. On a Cloudflare-managed domain, the host&rsquo;s managed AI bot protection can cover additional identified crawlers. [Cloudflare bot controls](https://developers.cloudflare.com/bots/additional-configurations/custom-rules/)

The guard covers this deployment. The public GitHub repository and the councils&rsquo; public datasets have their own access policies. Visitors and automated clients can still retrieve public content within the permitted traffic limits.
