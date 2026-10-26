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

The shipped asset is the saved Rhino render mesh from `ShiftLens_keychain_v03_fit_and_masks.3dm`, SHA-256 `62a853c5190bd726c9f4239996836cb381c39ae7063f92fc106e416e3ef523fd`. It includes all 30 hardware material regions: clear lenses, frame/rails, nine black masks, carrier, and 18 underside lettering regions. The original paper placeholder is replaced with the encoded image plane. No switch, knob, or roller is used. No CAD installation is required at runtime.

| Property | Fixed v03 value |
| --- | --- |
| Overall envelope | 40 × 30 × 7 mm |
| Lens window | 24 × 20 mm, eight 3 mm lenses |
| Lens radius / total profile height | 1.5 mm / 3 mm |
| Clear center per lens | 1.5 mm (50% total black masking) |
| Carrier | 36 × 24 × 2 mm |
| Slide travel | 1.5 mm |
| Sticker | 26.5 × 21.2 mm |
| Recess | 27.5 × 22.2 mm, 0.75 mm deep |
| Nominal sticker + adhesive thickness | 0.75 mm |
| Nominal image-to-lens gap | 0.5 mm |

The saved CAD places the carrier at its left stop, already offset -0.75 mm. The extraction script normalizes moving parts by +0.75 mm, retaining that transform in each part's provenance. The viewer then applies -0.75 to +0.75 mm to both the carrier and sticker; the lens/frame stay fixed. Geometry is not resized.

`src/demo/keychain.mjs` maps sticker coordinates in millimeters to the original region-compression image scheme, including the sticker margins. Image 1 occupies the right half of each carrier period; image 2 occupies the left. A single encoded canvas supplies the lens appearance, carrier texture, PDF, and PNG. The physical glass material and aperture-edge treatment are reused from the design tool. This is an idealized sliding-image preview, not a calibrated prediction of the fabricated lens or printer. The demo deliberately does not optimize or alter the fixed hardware.

Refresh the asset only when the fabricated model changes:

```sh
python -m pip install rhino3dm==8.35.0
python scripts/prepare-keychain.py /path/to/ShiftLens_keychain_v03_fit_and_masks.3dm
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
