# Karamela POS

## Development

Run the local app with:

```bash
npm run dev
```

## Production notes

- Apply the Supabase migrations in `supabase/migrations/` before deploying.
- Core business reporting now depends on filtered sales plus matching `sale_items`; avoid editing report queries without preserving that link.
- Android release setup and rollout steps are documented in [android/RELEASE.md](/C:/Users/DAGALA/Documents/karamela/android/RELEASE.md).

## Build

Create the web production build with:

```bash
npm run build
```
