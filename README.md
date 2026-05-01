# Doom Maze Prototype

A small Three.js maze prototype with:

- procedural maze generation
- a first-person camera controller
- an expandable minimap with a live player-direction marker
- click-to-route shortest path guidance on the minimap
- `M` keyboard toggle for the minimap with pointer-lock handoff
- wall collision with lightweight octree
- textures and lighting for visuals

# How to run

The best way to run this is by serving the `doom` folder with a local web server, since some browsers block file-based requests for security reasons. An easy way to do this is with Python:

```bash
cd path/to/doom
python -m http.server 8000
```

or is VS Code is installed, you can use the Live Server extension.

To run this smoothly it is advised to run this with a powerful enough GPU. A current issue with computers that support both integrated and dedicated GPUs is that the browser may default to the integrated GPU, which can cause performance issues. If you have a dedicated GPU, you can solve this by going to your system settings -> Display -> Graphics settings (or similar) and setting your browser .exe to use the high-performance GPU and restarting the browser.
