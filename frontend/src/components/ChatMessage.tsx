interface Props {
  content: string;
  role: "user" | "assistant" | "system";
}

export default function ChatMessage({ content, role }: Props) {
  return <div className={`message ${role}`}>{content}</div>;
}
