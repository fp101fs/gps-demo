# GPS Demo - Live Location Tracking & Fleet Management

A real-time GPS tracking application built with **React Native (Expo)** for mobile/web and **Supabase** for the backend. It allows users to track their journeys, share live location links, and create "Fleets" to view multiple users on a single map.

## 🌟 Key Features

### 📍 Live Tracking
- **Real-time GPS**: Tracks your location with high accuracy.
- **Visual Path**: Draws your route on an interactive map as you move.
- **Stats**: Shows duration, number of points captured, and your current address (reverse geocoded).

### 🔗 Sharing
- **Shareable Links**: Generate a unique URL for your active journey.
- **Live Updates**: Anyone with the link can watch your movement in real-time.
- **Share Back**: Viewers can click "Share My Location Back" to instantly appear on your map, creating an ad-hoc meeting point.

### 👥 Fleet Mode
- **Party Codes**: Enter a code (e.g., `roadtrip-2026`) to broadcast your location to a group channel.
- **Fleet View**: Enter the same code in the "Fleet" tab to see *everyone* in that group on one map.
- **Dynamic Map**: The map automatically zooms and pans to keep all fleet members in view.

### 🎨 Modern UI & Customization
- **Dark Mode**: Fully supported across the entire app and map tiles.
- **Custom Markers**: 
    - **Default**: A clear green cross icon.
    - **Avatar**: Option to use your Google Profile Picture as your map marker.
- **Pulsing Animation**: Markers have a "live" cyan pulse effect to show active tracking.

---

## 🏗 Architecture

### Tech Stack
- **Frontend**: React Native with Expo (works on iOS, Android, and Web).
- **Styling**: NativeWind (Tailwind CSS for React Native).
- **Maps**: `react-native-maps` (Native) and `Leaflet` (Web).
- **Auth**: Clerk (Google OAuth).
- **Backend**: Supabase (PostgreSQL + Realtime).

### How it Works
1.  **Location**: The app uses `expo-location` to capture coordinates in the background (or foreground on web).
2.  **Storage**: Points are saved to the `points` table in Supabase.
3.  **Real-time**: The app subscribes to Supabase changes. When a new point is inserted, the map updates instantly for all viewers.
4.  **Web Support**: The project is configured as a Progressive Web App (PWA) and uses specific web-compatible components (like Leaflet) where Native components aren't available.

---

## 🚀 Getting Started

### Prerequisites
- Node.js & npm
- A Supabase project (with the schema provided in `supabase_schema.sql` and update files).
- A Clerk account for authentication.

### Installation

1.  **Clone the repo:**
    ```bash
    git clone https://github.com/your-username/gps-demo.git
    cd gps-demo
    ```

2.  **Install dependencies:**
    ```bash
    cd mobile
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the `mobile` folder with:
    ```env
    EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
    EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key
    ```

4.  **Run the app:**
    ```bash
    npx expo start
    ```
    - Press `w` for Web.
    - Scan the QR code with your phone for Mobile (using Expo Go).

---

## 📱 Project Structure

- **`mobile/app`**: Screens and routing (Expo Router).
    - `(tabs)`: Main tabs (Home, Fleet, Settings).
    - `track/[id]`: Public shared tracking page.
- **`mobile/components`**: Reusable UI components.
    - `Map.tsx`: Native map implementation (Apple/Google Maps).
    - `Map.web.tsx`: Web map implementation (Leaflet).
- **`mobile/lib`**: Supabase client and utilities.
- **`mobile/assets`**: Images and icons (custom markers).

---

## 🔮 Future Roadmap
- [ ] Historical playback of journeys with a time slider.
- [ ] Speed and elevation graphs.
- [ ] Private fleets with password protection.