# OpenCode v2 Issue: Provider Settings Merged Rather Than Replaced on Configuration Reload

## Summary

When `opencode.json` is modified while the OpenCode background service is running, OpenCode emits a `config.updated` lifecycle event and updates its in-memory provider registry. However, the host performs an object merge (`deepMerge`) on `providers.<id>.settings` instead of replacing the settings object with the new file contents.

As a result:
- **Modifying an existing key** (e.g., from `true` to `false`) correctly overwrites the in-memory value.
- **Deleting an existing key** from `opencode.json` leaves the previous in-memory value intact because the key is absent in the new file and is not deleted by the merge operation.
- Calling `ctx.provider.list()` or `GET /api/provider` continues to return the deleted key with its old value.

## Environment

- OpenCode version: `2.0.30`
- `@opencode/plugin`: `2.0.26`
- OS: macOS (Darwin arm64)

## Steps to Reproduce

1. Configure a provider in `opencode.json` with an explicit setting:
   ```json
   {
     "providers": {
       "my-provider": {
         "name": "My Provider",
         "package": "@opencode-ai/ai/providers/openai-compatible",
         "settings": {
           "baseURL": "http://127.0.0.1:8000/v1",
           "modelsDiscovery": {
             "enabled": true,
             "smartModelName": true
           }
         }
       }
     }
   }
   ```
2. Start or observe the running OpenCode service. Querying `ctx.provider.list()` shows:
   ```json
   "settings": {
     "modelsDiscovery": {
       "enabled": true,
       "smartModelName": true
     }
   }
   ```
3. Edit `opencode.json` to **delete** `"smartModelName": true`:
   ```json
   {
     "providers": {
       "my-provider": {
         "name": "My Provider",
         "package": "@opencode-ai/ai/providers/openai-compatible",
         "settings": {
           "baseURL": "http://127.0.0.1:8000/v1",
           "modelsDiscovery": {
             "enabled": true
           }
         }
       }
     }
   }
   ```
4. Observe the `config.updated` event fired by OpenCode.
5. In the event listener or via `ctx.provider.list()`, inspect `my-provider.settings.modelsDiscovery`.

## Observed Behavior

`ctx.provider.list()` still contains:
```json
"modelsDiscovery": {
  "enabled": true,
  "smartModelName": true
}
```
The deleted property `"smartModelName"` is preserved in memory.

If step 3 is changed to explicitly set `"smartModelName": false`, `ctx.provider.list()` immediately reflects `"smartModelName": false`.

## Expected Behavior

When `opencode.json` changes, the provider's `settings` object should reflect the exact parsed contents of the updated configuration file (or missing keys should be deleted/reset), so that deleting a setting reverts it to its default behavior.

## Workaround

- Users should explicitly set keys to `false` or their default values (e.g., `"smartModelName": false`) rather than deleting them from `opencode.json`.
- Alternatively, restarting the OpenCode service (`opencode service restart`) forces a clean load from disk.
