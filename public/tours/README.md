Tour data lives here, one directory per city: `public/tours/<city>/tour.json`.
The build precaches every `.json` under this directory, so the tour survives a
dead spot. The schema and validator land in FAT-4.
