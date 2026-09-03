# Roku channel signing — recovery kit

Everything needed to sign future builds of the Mango Display Roku channel
from ANY Roku device, without this Mac. Dave asked for this to live with
the code for now (2026-09-03); move it to the company password manager
when convenient, and scrub it from git history when you do.

## The key

| item | value |
|---|---|
| Developer ID | `e3f1bfaf0ead2d212191a61c3e2ba164ae4fd2d4` |
| Signing password | **FILL IN BY HAND** — the string Roku printed after `genkey` on 2026-09-03 (also in Dave's Mac keychain: `security find-generic-password -a rokudev -s roku-signing -w`) |
| Generated on | Roku Express X026001ENXR9, Roku OS 15.3.4, 2026-09-03 |
| Signed package (rekey source) | `signing/MangoDisplay_1_0_test.pkg` (channel 1.0 build 1, TEST environment) |

The key itself lives on the Roku that generated it. There is no key file.
The **password plus any signed .pkg** together recreate it on another box.

## Sign a new build (on a Roku that already has the key)

1. Sideload the build: `./package.sh test` (or `prod`), then upload the zip
   at `http://<roku-ip>/` (user `rokudev`, dev-mode password).
2. Package it:

   ```bash
   curl --digest -u "rokudev:<dev-mode password>" \
     -F mysubmit=Package -F app_name=MangoDisplay_1_0 \
     -F pkg_time=$(date +%s)000 \
     -F passwd="<signing password>" \
     http://<roku-ip>/plugin_package
   ```

   `pkg_time` is required (the web UI adds it silently). The response
   contains a link like `pkgs/P<hash>.pkg`; download it from
   `http://<roku-ip>/pkgs/P<hash>.pkg`.
3. Bump `major_version` / `minor_version` / `build_version` in `manifest`
   before every upload — the dashboard wants each package's version higher
   than the last.

## Move the key to another Roku (`rekey`)

1. Put the new Roku in developer mode and sideload the saved
   `signing/MangoDisplay_1_0_test.pkg` (any signed .pkg of this channel).
2. Open the developer shell: `nc <roku-ip> 8080` (or telnet), press Return.
3. Type `rekey` and enter the signing password when asked. The box now
   holds the same key; its Dev ID matches the one above.

## Never do this

- Do not run `genkey` again on a box that holds the key: it REPLACES the
  key (new Dev ID) and, because Roku scopes a sideloaded channel's saved
  data to the Dev ID, the channel forgets its device code and goes back to
  the pairing screen (this happened 2026-09-03; the display's code had to
  be updated in the webapp).
- Do not lose the password: a key cannot be recovered without it, and a
  new key means a brand-new channel in the developer dashboard.

## Related

- Dev-mode password for Dave's Express: Mac keychain `-a rokudev -s roku-dev`.
- Beta channel: Roku developer dashboard, minimum firmware 15.1 (RSG 1.3).
