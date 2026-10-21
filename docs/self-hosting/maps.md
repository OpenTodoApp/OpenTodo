---
title: Maps
summary: The map provider behind task locations - what the server sends to OpenFreeMap and Photon, the tile cache, turning maps off, and running your own providers.
audience: admin
specs: [self-hosting]
screens: []
order: 46
---
# Maps

Task locations can show a map and search addresses ([Locations](../locations-and-places.md)). Maps are **on by default** and are the one outbound destination OpenTodo uses without being configured: **OpenFreeMap** for the map tiles and **Photon** for address search, both built on OpenStreetMap data.

## What reaches the provider

Browsers never contact the provider. They ask your server, which fetches from the provider with the user agent `OpenTodo/<version> (+https://open-todo.app)` and without cookies, tokens or the viewer's address. The provider sees:

- the tiles, fonts and icons of the areas being viewed;
- the text typed into the address search, and the point picked for a reverse search.

It never sees accounts, task content or stored locations. Searches are limited to 30 a minute per user and are not stored.

## Tile cache

Tiles, fonts and icons are kept under `<data>/cache/maps`, at most 200 MB, the least recently used first out. While the provider is unreachable the cached areas still show. The folder is not part of [backups](../backups.md); delete it at any time.

## Turn maps off or change providers

As the owner, open **Settings → Server → Maps**: switch maps off, or set another map style URL and Photon server. Each field can also be set by a variable, which wins over Settings and shows there as read-only:

| Variable | Meaning |
| --- | --- |
| `OPENTODO_MAPS` | `on` or `off` |
| `OPENTODO_MAPS_TILES_URL` | a map style URL (default `https://tiles.openfreemap.org/styles/liberty`) |
| `OPENTODO_MAPS_GEOCODER_URL` | a Photon server (default `https://photon.komoot.io`) |

An invalid value stops the server at startup with a message naming the variable. With maps off, the app makes no request to any map route. A [demo instance](demo.md) has maps off unless `OPENTODO_MAPS=on`.

## Run your own providers

Photon runs as one container next to OpenTodo ([komoot/photon](https://github.com/komoot/photon)); point `OPENTODO_MAPS_GEOCODER_URL` at it, private network addresses included. For tiles, any vector style with its sources works, such as your own OpenFreeMap or Protomaps instance. Please credit OpenStreetMap: the map shows the provider's attribution.
