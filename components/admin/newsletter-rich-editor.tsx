"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";

// Extend the base Image node with a `width` attribute so we can offer
// small/medium/full sizing. Rendered as an inline max-width style + attr
// so it round-trips through getHTML()/setContent() and survives sending.
const ResizableImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: (element) => element.getAttribute("width"),
                renderHTML: (attributes) => {
                    if (!attributes.width) return {};
                    return {
                        width: attributes.width,
                        style: `max-width: ${attributes.width}px; width: 100%;`,
                    };
                },
            },
        };
    },
});
import { Placeholder } from "@tiptap/extensions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UploadButton } from "@/lib/uploadthing";
import { newsletterTemplates } from "@/lib/newsletter-templates";

type Props = {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
};

export const NewsletterRichEditor = ({
                                         value,
                                         onChange,
                                         placeholder,
                                         className,
                                     }: Props) => {
    const [link, setLink] = useState("");
    const [imageSelected, setImageSelected] = useState(false);
    const [imageAlt, setImageAlt] = useState("");

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                bulletList: { keepMarks: true, keepAttributes: false },
                orderedList: { keepMarks: true, keepAttributes: false },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                autolink: true,
                linkOnPaste: true,
                HTMLAttributes: {
                    rel: "noopener noreferrer",
                    target: "_blank",
                },
            }),
            ResizableImage.configure({
                inline: false,
                allowBase64: false,
                HTMLAttributes: {
                    class: "my-4 rounded-md h-auto",
                },
            }),
            Placeholder.configure({
                placeholder: placeholder ?? "Write your newsletter...",
            }),
        ],
        content: value || "<p></p>",
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        onSelectionUpdate: ({ editor }) => {
            const active = editor.isActive("image");
            setImageSelected(active);
            if (active) {
                setImageAlt((editor.getAttributes("image").alt as string) ?? "");
            }
        },
        editorProps: {
            attributes: {
                class:
                    "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[260px] px-3 py-2",
            },
        },
    });

    useEffect(() => {
        if (!editor) return;

        const current = editor.getHTML();

        if (value && value !== current) {
            editor.commands.setContent(value, { emitUpdate: false });
        }

        if (!value && current !== "<p></p>") {
            editor.commands.setContent("<p></p>", { emitUpdate: false });
        }
    }, [value, editor]);

    if (!editor) return null;

    const setOrUnsetLink = () => {
        const url = link.trim();

        if (!url) {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    };

    const insertTemplate = (html: string) => {
        editor.chain().focus().insertContent(html).run();
    };

    const setImageWidth = (width: string | null) => {
        editor
            .chain()
            .focus()
            .updateAttributes("image", { width })
            .run();
    };

    const applyImageAlt = () => {
        editor
            .chain()
            .focus()
            .updateAttributes("image", { alt: imageAlt.trim() || null })
            .run();
    };

    const removeImage = () => {
        editor.chain().focus().deleteSelection().run();
        setImageSelected(false);
    };

    return (
        <div className={["w-full rounded-md border bg-background", className].filter(Boolean).join(" ")}>
            <div className="flex flex-wrap items-center gap-1 p-2">
                <Button
                    type="button"
                    variant={editor.isActive("bold") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                >
                    Bold
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("italic") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                    Italic
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("underline") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                >
                    Underline
                </Button>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <Button
                    type="button"
                    variant={editor.isActive("heading", { level: 1 }) ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                >
                    H1
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("heading", { level: 2 }) ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                    H2
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("heading", { level: 3 }) ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                    H3
                </Button>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <Button
                    type="button"
                    variant={editor.isActive("bulletList") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                    Bullets
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("orderedList") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                    Numbered
                </Button>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="secondary" size="sm">
                            Templates
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel>Insert a block</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {newsletterTemplates.map((tpl) => (
                            <DropdownMenuItem
                                key={tpl.id}
                                onSelect={() => insertTemplate(tpl.html)}
                                className="flex flex-col items-start gap-0.5"
                            >
                                <span className="font-medium">{tpl.label}</span>
                                <span className="text-xs text-muted-foreground">
                                    {tpl.description}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <Input
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="https://..."
                        className="h-9 w-full min-w-[140px] flex-1 sm:w-[220px] sm:flex-none"
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={setOrUnsetLink}>
                        Set link
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
                    >
                        Unlink
                    </Button>
                </div>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <UploadButton
                    endpoint="newsletterImage"
                    appearance={{
                        button: "h-9 rounded-md px-3 text-sm font-medium",
                    }}
                    content={{
                        button() {
                            return "Upload image";
                        },
                    }}
                    onClientUploadComplete={(files: any) => {
                        const file = files[0];
                        if (!file?.ufsUrl) return;

                        editor
                            .chain()
                            .focus()
                            .setImage({
                                src: file.ufsUrl,
                                alt: file.name ?? "Newsletter image",
                            })
                            .run();
                    }}
                    onUploadError={(error: Error) => {
                        console.error(error);
                    }}
                />

                <div className="ml-auto flex items-center gap-1">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                    >
                        Undo
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                    >
                        Redo
                    </Button>
                </div>
            </div>

            {imageSelected ? (
                <>
                    <Separator />
                    <div className="flex w-full flex-wrap items-center gap-2 bg-muted/40 p-2">
                        <span className="text-xs font-medium text-muted-foreground">
                            Image
                        </span>

                        <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Size:</span>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setImageWidth("200")}
                            >
                                Small
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setImageWidth("400")}
                            >
                                Medium
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setImageWidth(null)}
                            >
                                Full
                            </Button>
                        </div>

                        <Separator orientation="vertical" className="mx-1 h-8" />

                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-1">
                            <Input
                                value={imageAlt}
                                onChange={(e) => setImageAlt(e.target.value)}
                                onBlur={applyImageAlt}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        applyImageAlt();
                                    }
                                }}
                                placeholder="Alt text (describe the image)"
                                className="h-9 w-full min-w-[140px] flex-1 sm:w-[240px]"
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={applyImageAlt}
                            >
                                Set alt
                            </Button>
                        </div>

                        <Separator orientation="vertical" className="mx-1 h-8" />

                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={removeImage}
                        >
                            Remove
                        </Button>
                    </div>
                </>
            ) : null}

            <Separator />

            <EditorContent editor={editor} />
        </div>
    );
};