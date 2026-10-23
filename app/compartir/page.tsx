import type { Metadata } from "next";
import { ShareReceiver } from "@/components/share-receiver";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Fotos compartidas",
  robots: NOINDEX_ROBOTS,
};

// big-12: where the installed app lands after photos are shared to it from the phone (public/sw.js keeps them on
// the device). Signed in, it goes straight to the seller's listing form with the photos; signed out, it asks to sign in.
export default function SharedPhotosPage() {
  return <ShareReceiver />;
}
