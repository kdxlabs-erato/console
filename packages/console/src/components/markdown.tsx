import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isDocumentPath } from "../documents.js";
import { type Picture, PictureThumb } from "./pictures.js";
import { useRemotePictureSrc } from "./remote-pictures.js";

// What people and agents write is untrusted. It is rendered as React elements, never as HTML:
// raw HTML in the source stays text, links are limited to a few schemes and open elsewhere,
// and a picture from elsewhere, named over https, is read through the console (ADR-0048),
// lazily and without a referrer, or, where the page says so, not read at all and left a link
// (ADR-0141). A link whose destination is a document's path (ADR-0009) leads to the document's
// page, when the page knows where.

const SAFE_LINK = /^(https?:|mailto:)/i;
const SAFE_IMAGE = /^https:\/\//i;
/** Where a picture left unread may lead whoever opens it: a page, over the web. */
const SAFE_PICTURE_LINK = /^https?:\/\//i;

export interface MarkdownProps {
  readonly source: string;
  /** Where a document of the project is read, by its path; left out, such links stay text. */
  readonly docHref?: ((path: string) => string) | undefined;
  /**
   * Where a picture named in the text is read, when the text comes with files: given the
   * source of `![words](source)`, the address of the file it names, or nothing. A picture that
   * is neither one of those nor over https stays text.
   */
  readonly fileSrc?: ((source: string) => string | undefined) | undefined;
  /**
   * Called when a picture that came with the text is pressed, to show it large over the page;
   * left out, such a picture is only seen where it is.
   */
  readonly onOpenPicture?: ((picture: Picture, opener: HTMLElement) => void) | undefined;
  /**
   * Whether a picture named in the text is left unread: shown as its words, a link to where it
   * is for whoever chooses to open it, and nothing fetched by the page showing the text. For
   * what an agent's session wrote, which nobody looked at before it is shown (ADR-0141).
   */
  readonly picturesAsLinks?: boolean | undefined;
}

export function Markdown(props: MarkdownProps) {
  const remote = useRemotePictureSrc();
  return (
    <div className="sc-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Everything passes through here unchanged; the components below decide what a URL may do.
        urlTransform={(url) => url}
        components={{
          a({ href, children }) {
            if (href === undefined || href === "") {
              return <span>{children}</span>;
            }
            if (href.startsWith("#")) {
              return <a href={href}>{children}</a>;
            }
            const hash = href.indexOf("#");
            const path = hash < 0 ? href : href.slice(0, hash);
            if (props.docHref !== undefined && isDocumentPath(path)) {
              return (
                <a href={`${props.docHref(path)}${hash < 0 ? "" : href.slice(hash)}`}>{children}</a>
              );
            }
            if (SAFE_LINK.test(href)) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
                  {children}
                </a>
              );
            }
            return <span>{children}</span>;
          },
          img({ src, alt, title }) {
            if (props.picturesAsLinks === true) {
              const where = typeof src === "string" ? src : "";
              const words = alt === undefined || alt.length === 0 ? where : alt;
              return SAFE_PICTURE_LINK.test(where) ? (
                <a href={where} target="_blank" rel="noopener noreferrer nofollow ugc">
                  {words}
                </a>
              ) : (
                <span className="sc-prose-image-text">{words}</span>
              );
            }
            const named = typeof src === "string" ? props.fileSrc?.(src) : undefined;
            const url =
              named ?? (typeof src === "string" && SAFE_IMAGE.test(src) ? remote(src) : undefined);
            if (url === undefined) {
              return <span className="sc-prose-image-text">{alt ?? ""}</span>;
            }
            if (
              named !== undefined &&
              props.onOpenPicture !== undefined &&
              typeof src === "string"
            ) {
              const name = src.startsWith("./") ? src.slice(2) : src;
              return (
                <PictureThumb
                  picture={{ src: named, alt: alt ?? "", name }}
                  onOpen={props.onOpenPicture}
                />
              );
            }
            return (
              <img
                src={url}
                alt={alt ?? ""}
                title={title}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            );
          },
        }}
      >
        {props.source}
      </ReactMarkdown>
    </div>
  );
}
