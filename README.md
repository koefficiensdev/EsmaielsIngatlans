# IngatlanHub (Vanilla JS Website)

A real-estate website inspired by ingatlan.com, built with only HTML, CSS, and JavaScript.

Start page: `main.html`

## Features

- Listing browse page for apartments and houses.
- Search and filters (text, rent/sale, type, min/max price).
- Login and registration with Firebase Authentication.
- Auth-only listing publish form (rent/sale).
- Listing details page with map and nearby transport stops.
- Firestore + Firebase Storage for listing data and image uploads.
- Demo listing fallback if Firebase config is missing.

## 1) Firebase Setup

1. Create a Firebase project.
2. Enable **Authentication > Email/Password**.
3. Enable **Firestore Database**.
4. Enable **Storage**.
5. Open `assets/js/firebase-config.js` and replace placeholders with your keys.

## 2) Firestore and Storage Security

Use these files when setting Firebase security rules:

- `firestore.rules`
- `storage.rules`

These rules enforce:

- Anyone can read listings.
- Only logged-in users can create listings.
- Users can update/delete only their own listings.
- Users can upload images only under their own folder.

## 3) Run the Website

Because the project uses ES modules, serve it over HTTP (not direct file:// opening).

Example:

```bash
cd /Users/dev/Downloads/Website/GitHub/EsmaielsIngatlans
python3 -m http.server 8080
```

Then open:

- http://localhost:8080/main.html

## Notes

- `main.html` is the entry point.
- Nearby transport is loaded from OpenStreetMap Overpass API on each property detail page.
- If Firebase is not configured yet, demo listings are shown so UI can still be tested.
