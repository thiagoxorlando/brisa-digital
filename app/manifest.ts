import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CastAnet",
    short_name: "CastAnet",
    description:
      "CastAnet gives creative agencies a private workspace with branded talent portal, digital contracts, escrow payments and internal agents — all in one platform.",
    start_url: "/",
    icons: [
      { src: "/brand/castanet-new/WEB/android-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/castanet-new/WEB/android-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
