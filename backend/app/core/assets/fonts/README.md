# Fonts

`Inter-Regular.ttf` and `Inter-SemiBold.ttf` are static instances (wght 400 and 600, opsz 14)
of Inter's variable font, the `latin` and `latin-ext` subsets of the `@fontsource-variable/inter`
package the frontend already uses (version 5.3.0, SIL Open Font License 1.1, `LICENSE-Inter.txt`)
instanced with fontTools' `instancer` and joined with its `merge`. The PDF export embeds them (`app/workouts/export.py`), so an
exported plan is set in the app's typeface and any Latin name a user types survives (the PDF
core fonts only know Latin-1).
