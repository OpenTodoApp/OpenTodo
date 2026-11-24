## Decisions

### D1: Devices never change a stored row's upload state

The resolver refuses `uploaded_at` from any device on an existing attachment, whatever its value or the caller's role. The only exception is the author repeating `null` while the stored value is `null`: a device whose create batch reached the server but whose answer was lost sends it again, and refusing it would show a needless "not accepted" notice. A read error refuses the op instead of allowing it.

### D2: An upload repairs a row the file already backs

The file's size and digest were checked when it was written (`blobs.Write`), so a stored file is valid evidence. When the row reads not uploaded and the file exists, the route marks it uploaded as the author, marks the copies that share it, and answers 204 without reading the body. The row's author is the only caller who reaches this, as for any upload.
