"use client";

import { useEffect, useRef } from "react";

type TripOverviewMapCanvasPoint = {
  id: string;
  label: string;
  subtitle: string;
  placeName: string;
  lng: number;
  lat: number;
};

export default function TripOverviewMapCanvas({
  resolvedStops
}: {
  resolvedStops: TripOverviewMapCanvasPoint[];
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || resolvedStops.length === 0) {
      return;
    }

    let disposed = false;
    let cleanup = () => {};

    void import("maplibre-gl")
      .then((module) => {
        if (disposed || !mapContainerRef.current) {
          return;
        }

        const maplibregl = module.default ?? module;
        if (!maplibregl?.Map) {
          return;
        }

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [resolvedStops[0].lng, resolvedStops[0].lat],
          zoom: resolvedStops.length > 1 ? 9 : 12,
          attributionControl: false
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(
          new maplibregl.AttributionControl({
            compact: true
          })
        );

        map.on("load", () => {
          if (resolvedStops.length > 1) {
            map.addSource("trip-route", {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: resolvedStops.map((stop) => [stop.lng, stop.lat])
                },
                properties: {}
              }
            });

            map.addLayer({
              id: "trip-route-line",
              type: "line",
              source: "trip-route",
              paint: {
                "line-color": "#0f172a",
                "line-opacity": 0.65,
                "line-width": 3
              }
            });
          }

          const bounds = new maplibregl.LngLatBounds();
          resolvedStops.forEach((stop, index) => {
            const markerElement = document.createElement("div");
            markerElement.className =
              "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-xs font-semibold text-white shadow-lg";
            markerElement.textContent = String(index + 1);
            new maplibregl.Marker({ element: markerElement })
              .setLngLat([stop.lng, stop.lat])
              .setPopup(
                new maplibregl.Popup({ offset: 16 }).setHTML(
                  `<div style="min-width:180px"><strong>${stop.label}</strong><br/><span style="color:#64748b">${stop.subtitle}</span><br/><span style="color:#64748b">${stop.placeName}</span></div>`
                )
              )
              .addTo(map);
            bounds.extend([stop.lng, stop.lat]);
          });

          if (resolvedStops.length > 1) {
            map.fitBounds(bounds, {
              padding: 48,
              maxZoom: 13
            });
          }
        });

        cleanup = () => {
          map.remove();
        };
      })
      .catch(() => {});

    return () => {
      disposed = true;
      cleanup();
    };
  }, [resolvedStops]);

  return <div ref={mapContainerRef} className="h-[320px] w-full" />;
}
