# UIST keychain demo

Open **Demo** in the main toolbar, or visit [`/shiftlens/demo/`](https://hcielab.github.io/shiftlens/demo/). The full design tool remains at the site root. The demo has one fixed keychain, two image states, and no mechanism or surface editor.

## At the demo table

1. Open the demo on the laptop. Leave that tab open. Each session shows a fresh QR code that lasts 15 minutes.
2. A visitor scans the code with their phone camera. The phone page opens the native photo picker (`accept="image/*"`, without camera-only `capture`). Choose two photos. The thumbnails show the center crop; **Fit entire photo** adds white margins instead of cutting off content.
3. Tap **Send to the laptop** and wait for **Both photos arrived**. The laptop accepts both together, verifies their checksums, decodes them, and updates the two image slots. It will not accept a second participant into the completed session.
4. Drag the keychain or scrub the slider; **Play** animates the same 1.5 mm travel. Right-drag or two-finger drag orbits; scroll/pinch zooms.
5. **Download PNG** is the main download and produces the encoded image with physical-size metadata for **26.5 × 21.2 mm**. Set that size explicitly if your print app ignores PNG density. The secondary **Exact-size PDF** option produces a one-page PDF at the same dimensions; print it at **Actual size / 100%**. Disable page fitting, borderless enlargement, and automatic image fill. Cut to the image boundary. Center the insert in the carrier's **27.5 × 22.2 mm** recess (0.5 mm clearance on all sides), with the image upright when the keyring hole is on the left. Image 1 is at the closed-end stop; sliding the carrier right by 1.5 mm reveals image 2.
6. **Next visitor** clears both photos, stops animation, and destroys the previous connection. It generates a new session and QR code. **New QR code** only renews the connection and retains the current photos.

Laptop uploads always work independently of phone pairing. No printer make or stock size is assumed. A printer app that forces every photo to fill the paper will change the lens pitch. Use a driver/app that accepts the PDF at actual size. **Download PNG** produces: 1060 × 848 pixels, with a PNG `pHYs` chunk of 40,000 pixels/meter (1016 PPI) in both directions. Some photo apps ignore this metadata, so enter 26.5 × 21.2 mm explicitly or use the PDF. The 3 mm pitch is 120 raster pixels; each state band is 60 pixels.

## Hardware and encoding

The shipped asset is the saved Rhino render mesh from `ShiftLens_keychain_v04.3dm`, SHA-256 `16e61298f58ce291148a12c9071e3da751d1115faf515740b335eadaccc23295`. It includes all 30 hardware material regions: clear lenses, frame/rails, nine black masks, carrier, and 18 underside lettering regions. The original paper placeholder is replaced with the encoded image plane. No switch, knob, or roller is used. No CAD installation is required at runtime.

| Property | Fixed v04 value |
| --- | --- |
| Overall envelope | 40 × 30 × 5.4 mm |
| Lens window | 24 × 20 mm, eight 3 mm lenses |
| Lens radius / total profile height | 1.5 mm / 2.1 mm |
| Clear center per lens | 1.5 mm (50% total black masking) |
| Carrier | 36 × 24 × 2 mm |
| Slide travel | 1.5 mm |
| Sticker | 26.5 × 21.2 mm |
| Recess | 27.5 × 22.2 mm, 0.75 mm deep |
| Nominal sticker + adhesive thickness | 0.75 mm |
| Clear substrate below hemisphere | 0.6 mm (0.2 × pitch) |
| Nominal image-to-lens air gap | 0.15 mm |
| Vertical guide clearance per side | 0.15 mm |
| Lateral guide clearance per side | 0.5 mm |

The saved CAD places the carrier at its left stop, already offset -0.75 mm. The extraction script normalizes moving parts by +0.75 mm, retaining that transform in each part's provenance. The viewer then applies -0.75 to +0.75 mm to both the carrier and sticker; the lens/frame stay fixed. Geometry is not resized.

`src/demo/keychain.mjs` maps sticker coordinates in millimeters to the original region-compression image scheme, including the sticker margins. Image 1 occupies the right half of each carrier period; image 2 occupies the left. A single encoded canvas supplies the lens appearance, carrier texture, PDF, and PNG. The glass material is reused from the design tool. The demo now traces through the curved entry surface, both faces of the finite-thickness mask, and the glass-to-air exit to the actual printed-image plane. It samples the same encoded canvas at that hit point; it does not stretch a whole image strip over each lens by assumption. This is a nominal geometric simulation, not a measured resin/printer calibration. The full design tool retains its existing preview modes. The demo does not optimize or alter the fixed hardware.

### Why v04

Paper §§3.1 and 5.3 specify interleaved image strips of width **p/N**; two states therefore remain **50% + 50%**, with 1.5 mm travel. The requested **approximately 40%** describes the normal-incidence *refracted footprint*, not a new 40% encoding ratio. The paper does not prescribe a universal 40% footprint. Its Fig. 7/§5.1 defines h from the lens feet to the pattern plane in the homogeneous optical model; this separated paper insert additionally has an air interface.

v03 had a 1.5 mm substrate and a 0.5 mm gap. v04 preserves the source semicircular radius of 1.5 mm, removes 0.9 mm of flat substrate, and uses a 0.15 mm nominal air gap. At the source CAD IOR of **1.4**, tracing through the actual 0.3 mm mask channel gives a normal-view footprint **1.19817 mm wide, or 39.939% of the 3 mm pitch**. This is an independent Python calculation, not a claimed measurement or a value quoted from the paper. IOR 1.4 comes from the source CAD material; the paper evaluation code uses 1.52. The result depends on the material IOR. Vertical guide play allows a gap of 0–0.30 mm (about 44.2–35.7% footprint); the 0.15 mm nominal position is not a mechanical detent.

The carrier, recess, sticker thickness, keyring geometry, and underside letters retain their shapes. Vertical rails are reduced to 0.15 mm clearance per side; side clearances remain 0.5 mm. Saved-solid checks confirm the dimensions, closed volumes and collision-free nominal travel. [CAD and optical checks](keychain-v04-validation.json) include provenance and the independent footprint calculation. The physical assembly is thinner: 40 × 30 × 5.4 mm. Printing tolerances and finish remain material/process dependent.

Refresh the asset only when the fabricated model changes:

```sh
python -m pip install rhino3dm==8.35.0
python scripts/prepare-keychain.py /path/to/ShiftLens_keychain_v04.3dm
```

The script reads saved render meshes; it does not run Rhino or regenerate CAD. A different model requires updating the fixed profile, source hash, and dimension/registration tests together.

## Phone connection architecture

GitHub Pages hosts static files, so it cannot itself receive a server-side upload. Both pages use PeerJS/WebRTC. The default PeerJS Cloud service on `0.peerjs.com` handles signaling; Google STUN discovers network addresses. Image bytes travel on an encrypted WebRTC data channel. They are not uploaded to GitHub or stored by this app in a database, localStorage, or IndexedDB. Signaling services see connection metadata. A configured TURN relay can carry encrypted traffic when a direct path is unavailable.

The QR URL keeps its random session token in the fragment (not the HTTP query). A separate random peer ID is used for signaling. The laptop requires the matching token before accepting data and permits one active phone. The token is a short-lived bearer link: anyone who scans it can submit to that session. Each transfer is exactly two images, at most 6 MiB each after normalization, in acknowledged 16 KiB chunks. Size, sequence, and SHA-256 checks prevent incomplete pairs from reaching the preview. Decoding and dimension checks run again on receipt. Phone images are oriented, resized, and redrawn to JPEG before transfer, stripping original EXIF metadata. Browsers that cannot decode HEIC show a JPEG/PNG fallback message.

Phones and the laptop need Internet access for signaling. A shared hotspot is a useful venue fallback; test on the actual network. Networks with peer isolation, restrictive firewalls, or symmetric NAT can prevent a direct WebRTC connection. A QR code alone cannot remove that restriction. No TURN service has been provisioned for this repository. A failed connection is shown in the UI, and laptop upload remains available.

For an operator-managed service, these optional Vite build variables configure PeerJS:

- `VITE_DEMO_PEER_HOST`, `VITE_DEMO_PEER_PORT` (default 443), `VITE_DEMO_PEER_PATH` (default `/`), using TLS.
- `VITE_DEMO_ICE_SERVERS`: JSON array in the standard `RTCIceServer` format.

All Vite variables are public client configuration. Do not put private permanent credentials in them. A production TURN setup should issue short-lived credentials via an operator-controlled endpoint; that backend is not included here.

## Deployment and checks

The Vite multi-page build includes the design tool, `demo/index.html`, and `demo/upload.html`. `.github/workflows/pages.yml` supplies the GitHub project base path and deploys `dist/` after the tests pass. Local development uses `/demo/`; deployed URLs retain `/shiftlens/demo/` through relative links.

`tests/demo.test.mjs` covers CAD bounds and moving-frame normalization, sticker coverage through travel, image-band registration at both states, endpoint preview decoding, PNG physical density, exact PDF page geometry and embedded pixels, transfer limits and ordering, checksums, and the GitHub Pages pairing URL.

Browser verification also checks the actual two-page transfer, received thumbnails, state switching, animation, and downloads. This does not substitute for testing iOS/Android gallery behavior, the conference network, or the printer chosen for the table.

References: [GitHub Pages hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [PeerJS connections and NAT/TURN](https://peerjs.com/client/faq), [PeerJS API](https://peerjs.com/client/api/peer), [native file inputs](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file).
