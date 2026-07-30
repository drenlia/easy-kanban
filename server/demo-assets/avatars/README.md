# Demo profile photos (optional)

Place image files here for richer demo avatars. They are **not** committed to git.

## Naming

| File | Used for |
|------|----------|
| `admin.jpg` (or `.png` / `.jpeg` / `.webp`) | Default admin user (`admin@kanban.local`) when `DEMO_ENABLED=true` |
| `john.jpg` | Demo user John Smith |
| `sarah.jpg` | Demo user Sarah Johnson |
| `mike.jpg` | Demo user Mike Davis |

Supported extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.

## Behavior

On demo database initialization:

1. If a matching file exists, it is **copied** into `server/avatars/` and linked on the user.
2. If missing, a generated letter SVG avatar is used instead.

Override the seed directory with env `DEMO_AVATAR_DIR` if needed.

Re-run / reset the demo database after adding photos so users are recreated with the new avatars.
