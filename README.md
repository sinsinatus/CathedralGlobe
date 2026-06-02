CathedralGlobe – Project Status Summary
Date: 3 June 2026Overall GoalsBuild a scalable, user-friendly platform for creating and managing AI-powered 3D digital twins of physical assets.
Deliver an interactive “Orbital Empire” globe with live asset pins and statistics.
Support asset-centric ownership via service-managed hosted wallets (future NFT support).
Enable media uploads and future AI-driven item recognition with spatial metadata.
Provide a rich, immersive in-app 3D viewer with interactive item sidebar.

Key Decisions & Architecture ChoicesFrontend: React Native + Expo (web-first; native development deprioritized due to crashes).
Backend: Supabase (Postgres + Edge Functions + Storage).
3D Generation: Meshy.ai (stable text-to-3D with improved prompts).
3D Viewer: @react-three/fiber/native + @react-three/drei/native + OrbitControls.
Data Model: builds, media, and items tables (items linked to builds with metadata).
Ownership: Asset owns hosted wallet; basic NFT metadata generated on creation.

Current Progress / StatusFully functional interactive globe with colored pins by asset type.
Complete asset creation flow (prompt + optional media + GPS/manual location).
Meshy integration stable: generation, polling, automatic .glb download and storage.
In-app 3D viewer now working with OrbitControls (drag to rotate).
Dynamic side panel in viewer showing items list (loaded from DB).
Add New Item functionality fully working (modal + DB insert).
Delete asset fully functional (cascades media + model files).
Hosted wallet generation with basic metadata.

Important Files / ComponentsComponent
Status
Notes
App.tsx
Complete
Main app, globe, creation modal, delete, viewer launcher
ModelViewer.tsx
Complete
Immersive 3D viewer + dynamic items sidebar + add item modal
generate-3d-model (Edge Function)
Complete
Enhanced prompt + Meshy task creation
check-meshy-status (Edge Function)
Complete
Polling + .glb download to storage
Supabase tables
Ready
builds, media, items (with metadata JSONB)

Open Tasks & BlockersHigh PriorityImprove 3D viewer zoom (scroll wheel / pinch currently unreliable on web).
Add document upload (camera / library) to items (“Add Document” button).

Medium PriorityClick item in sidebar → highlight / zoom to it in 3D model.
Thorough mobile testing via Expo Go / custom dev build.
Improve Meshy prompt quality for better interior/exterior detail.

Future ConsiderationsActual NFT minting to hosted wallets.
AI auto-detection of items from uploaded photos/videos.
Scalable queuing, E2EE, MFA.

Critical Context & ConstraintsCurrently Expo Web focused (native builds deprioritized).
Storage buckets (media, models) are public.
RLS temporarily disabled on items table for development speed.
3D models stored as public .glb files in Supabase Storage.

Summary: The core platform (globe + asset creation + 3D viewer + dynamic items) is now functional and connected to the database. The experience is already significantly more interactive than before.

