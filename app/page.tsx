import { readdirSync } from "node:fs";
import path from "node:path";
import { ChatApp } from "@/components/chat/chat-app";

export default function Home() {
  // Count the pages in the knowledge base for the welcome screen ("Searches 18 official CSULB pages").
  // This runs on the server when the page is built, so the number always matches knowledge/.
  const pageCount = readdirSync(path.join(process.cwd(), "knowledge")).filter((f) => f.endsWith(".md")).length;
  return <ChatApp pageCount={pageCount} />;
}
