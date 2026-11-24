import { ChatApp } from "@/components/chat/chat-app";
import { knowledgePageCount } from "@/lib/knowledge";

export default function Home() {
  // The number of pages in the knowledge base for the welcome screen ("Searches 121 official CSULB pages").
  // This runs on the server when the page is built, so the number always matches knowledge/.
  return <ChatApp pageCount={knowledgePageCount()} />;
}
