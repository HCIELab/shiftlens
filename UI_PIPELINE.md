# Interface alignment with version 17

The web editor follows the source interface’s three sections, rather than independent feature tabs.

| Original source | Web behavior |
| --- | --- |
| `object_188_label.py`: Step 1 | Surface family, primary curve, axis/direction, revolve angle or translation, lens width, flip, rails and surface thickness remain together. |
| `object_198_buttonicon.py`, 202, 206 | The original three PNG surface illustrations are reused from `framework_assets`. |
| `object_214_label.py`, 216: Select Primary Curve | Define/Edit opens an explicit curve editor. A blank project contains no curve. Drawing, dragging, XYZ editing and point-list import replace selecting existing Rhino scene geometry. |
| `object_218_label.py`, 220: Select Revolve Axis | Define an XYZ origin and direction. Translation labels the direction accordingly. |
| `object_228_label.py`: Step 2 | Mechanism selection and image-state assignment remain together. |
| `object_237_dropdown.py`: User Custom, Switch, Knob, Roller | User Custom uses timeline control; Switch, Knob and Roller are enabled on compatible generated surfaces. Placement validates footprint and reach, followed by full sampled solid checks. |
| `object_388_py3.py` and 397 | Placement remains a viewport action. The browser fits original CAD hardware, mounts, rack tracks and swept clearance openings together. A mouse-following native-mesh preview shows valid and rejected locations. |
| `object_243_filepicker.py`, image rows 251/256 and 265/270 | Each state has a Browse action, image thumbnail, and Preview State in Viewport action. |
| `object_278_label.py`: Step 3; 294/296 and 298/300 | Start/Stop and Export remain together. The persistent transport duplicates simulation controls for convenience. |

New design, example loading, file opening and saving are explicit header actions. New design is empty, examples are optional, and empty/partial drafts round-trip in project schema version 2. Version 1 files remain readable. Undo can recover a design replaced by New design or an example during the session.

Switch has two image states. Knob supports 2–5 and Roller/User Custom support 2–10 through the Image states selector. Image encoding, playback and direct mechanism interaction share the same state count and motion. Physical detents and calibrated general optics are not implemented. See docs/native-mechanisms.md for the source CAD and fitted web constraints.
