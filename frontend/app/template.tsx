// Next.js re-creates a template on every navigation (unlike the layout), so each page eases in.
export default function Template({ children }: { children: React.ReactNode }) {
    return <div className="page-enter">{children}</div>;
}
