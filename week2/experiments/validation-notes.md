# Validation notes

Both implementations are checked by the same public API and browser contracts.
The generated application's five source files have not been edited after generation;
SHA-256 checks in `tests/conformance.mjs` enforce this.

The first browser run against the generated application timed out in the delayed
ratings case because the test waited for the literal number `100,000` in the
metadata status. The prompt required a loaded status and card counts, but did not
require that number in the status message. The generated application correctly
said "Popularity metadata loaded" and populated the cards. The oracle was corrected
to wait for an actual numeric rating count in a result card, then verify that the
selection error and ranking are preserved. No generated code or prompt change
was needed. The failed assertion was a test assumption, not an application fix.

Full-catalogue conformance also found three titles with trailing spaces in the raw
dataset (IDs 1128, 1201 and 1635). The generated parser already trimmed them. The
maintained parser was updated to trim title whitespace too; genre vectors and
ranking were unaffected. Generated source remained unchanged.
