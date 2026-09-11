import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";
import RemarkMath from "remark-math";
import RemarkBreaks from "remark-breaks";
import RehypeKatex from "rehype-katex";
import RemarkGfm from "remark-gfm";
import RehypeRaw from "rehype-raw";
import RehypeHighlight from "rehype-highlight";
import { useRef, useState, RefObject, useEffect, useMemo } from "react";
import { copyToClipboard, useWindowSize } from "../utils";
import mermaid from "mermaid";
import Locale from "../locales";
import LoadingIcon from "../icons/three-dots.svg";
import React from "react";
import { useDebouncedCallback } from "use-debounce";
import { showImageModal, showToast } from "./ui-lib";
import { HTMLPreview, HTMLPreviewHander } from "./artifacts";
import { useChatStore } from "../store";

import { useAppConfig } from "../store/config";
import { FileAttachment } from "./file-attachment";
import { encode } from "../utils/token";

function Details(props: { children: React.ReactNode }) {
  return <details open>{props.children}</details>;
}
function Summary(props: { children: React.ReactNode }) {
  return <summary>{props.children}</summary>;
}

import clsx from "clsx";

export function Mermaid(props: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (props.code && ref.current) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
      });
      mermaid
        .run({
          nodes: [ref.current],
          suppressErrors: true,
        })
        .catch((e) => {
          setHasError(true);
          console.error("[Mermaid] ", e.message);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.code]);

  function viewSvgInNewWindow() {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const text = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([text], { type: "image/svg+xml" });
    showImageModal(URL.createObjectURL(blob));
  }

  if (hasError) {
    return null;
  }

  return (
    <div
      className={clsx("no-dark", "mermaid")}
      style={{
        cursor: "pointer",
        overflow: "auto",
      }}
      ref={ref}
      onClick={() => viewSvgInNewWindow()}
    >
      {props.code}
    </div>
  );
}

export function PreCode(props: { children: any }) {
  const ref = useRef<HTMLPreElement>(null);
  const previewRef = useRef<HTMLPreviewHander>(null);
  const [mermaidCode, setMermaidCode] = useState("");
  const [htmlCode, setHtmlCode] = useState("");
  const { height } = useWindowSize();
  const chatStore = useChatStore();
  const session = chatStore.currentSession();

  const renderArtifacts = useDebouncedCallback(() => {
    if (!ref.current) return;
    const mermaidDom = ref.current.querySelector("code.language-mermaid");
    if (mermaidDom) {
      setMermaidCode((mermaidDom as HTMLElement).innerText);
    }
    const htmlDom = ref.current.querySelector("code.language-html");
    const refText = ref.current.querySelector("code")?.innerText;
    if (htmlDom) {
      setHtmlCode((htmlDom as HTMLElement).innerText);
    } else if (
      refText?.startsWith("<!DOCTYPE") ||
      refText?.startsWith("<svg") ||
      refText?.startsWith("<?xml")
    ) {
      setHtmlCode(refText);
    }
  }, 600);

  const config = useAppConfig();
  const enableArtifacts =
    session.mask?.enableArtifacts !== false && config.enableArtifacts;

  //Wrap the paragraph for plain-text
  useEffect(() => {
    if (ref.current) {
      const codeElements = ref.current.querySelectorAll(
        "code",
      ) as NodeListOf<HTMLElement>;
      const wrapLanguages = [
        "",
        "md",
        "markdown",
        "text",
        "txt",
        "plaintext",
        "tex",
        "latex",
      ];
      codeElements.forEach((codeElement) => {
        let languageClass = codeElement.className.match(/language-(\w+)/);
        let name = languageClass ? languageClass[1] : "";
        if (wrapLanguages.includes(name)) {
          codeElement.style.whiteSpace = "pre-wrap";
        }
      });
      setTimeout(renderArtifacts, 1);
    }
  }, []);

  return (
    <>
      <pre ref={ref}>
        <span
          className="copy-code-button"
          onClick={() => {
            if (ref.current) {
              copyToClipboard(
                ref.current.querySelector("code")?.innerText ?? "",
              );
            }
          }}
        ></span>
        {props.children}
      </pre>
      {mermaidCode.length > 0 && (
        <Mermaid code={mermaidCode} key={mermaidCode} />
      )}
      {htmlCode.length > 0 && enableArtifacts && (
        <HTMLPreview
          ref={previewRef}
          code={htmlCode}
          autoHeight={!document.fullscreenElement}
          height={!document.fullscreenElement ? 600 : height}
        />
      )}
    </>
  );
}

function CustomCode(props: { children: any; className?: string }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const config = useAppConfig();
  const enableCodeFold =
    session.mask?.enableCodeFold !== false && config.enableCodeFold;

  const ref = useRef<HTMLPreElement>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [showToggle, setShowToggle] = useState(false);

  useEffect(() => {
    if (ref.current) {
      const codeHeight = ref.current.scrollHeight;
      setShowToggle(codeHeight > 400);
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [props.children]);

  const toggleCollapsed = () => {
    setCollapsed((collapsed) => !collapsed);
  };
  const renderShowMoreButton = () => {
    if (showToggle && enableCodeFold && collapsed) {
      return (
        <div
          className={clsx("show-hide-button", {
            collapsed,
            expanded: !collapsed,
          })}
        >
          <button onClick={toggleCollapsed}>{Locale.NewChat.More}</button>
        </div>
      );
    }
    return null;
  };
  return (
    <>
      <code
        className={clsx(props?.className)}
        ref={ref}
        style={{
          maxHeight: enableCodeFold && collapsed ? "400px" : "none",
          overflowY: "hidden",
        }}
      >
        {props.children}
      </code>

      {renderShowMoreButton()}
    </>
  );
}

function escapeBrackets(text: string) {
  const pattern =
    /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g;
  return text.replace(
    pattern,
    (match, codeBlock, squareBracket, roundBracket) => {
      if (codeBlock) {
        return codeBlock;
      } else if (squareBracket) {
        return `$$${squareBracket}$$`;
      } else if (roundBracket) {
        return `$${roundBracket}$`;
      }
      return match;
    },
  );
}

function tryWrapHtmlCode(text: string) {
  // try add wrap html code (fixed: html codeblock include 2 newline)
  // ignore embed codeblock
  if (text.includes("```")) {
    return text;
  }
  return text
    .replace(
      /([`]*?)(\w*?)([\n\r]*?)(<!DOCTYPE html>)/g,
      (match, quoteStart, lang, newLine, doctype) => {
        return !quoteStart ? "\n```html\n" + doctype : match;
      },
    )
    .replace(
      /(<\/body>)([\r\n\s]*?)(<\/html>)([\n\r]*)([`]*)([\n\r]*?)/g,
      (match, bodyEnd, space, htmlEnd, newLine, quoteEnd) => {
        return !quoteEnd ? bodyEnd + space + htmlEnd + "\n```\n" : match;
      },
    );
}

function formatThinkText(text: string): string {
  // 创建一个函数来处理思考时间
  const handleThinkingTime = (thinkContent: string) => {
    // 尝试从localStorage获取开始和结束时间
    try {
      const thinkStartKey = `think_start_${thinkContent
        .substring(0, 50)
        .trim()}`;
      const thinkEndKey = `think_end_${thinkContent.substring(0, 50).trim()}`;

      // 获取开始时间
      const startTime = localStorage.getItem(thinkStartKey);

      if (startTime) {
        // 检查是否已经有结束时间
        let endTime = localStorage.getItem(thinkEndKey);

        // 如果没有结束时间，才设置当前时间为结束时间
        if (!endTime) {
          endTime = Date.now().toString();
          localStorage.setItem(thinkEndKey, endTime);
        }

        // 使用结束时间计算持续时间
        const duration = Math.round(
          (parseInt(endTime) - parseInt(startTime)) / 1000,
        );
        return duration;
      }
    } catch (e) {
      console.error("处理思考时间出错:", e);
    }

    return null;
  };

  // 改进的 HTML 转义函数，更好地处理代码块和 HTML 标签
  const escapeHtmlPreserveCodeBlocks = (str: string) => {
    // 使用更复杂的正则表达式来匹配代码块
    // 这个正则表达式匹配 ```code``` 和 `inline code`
    const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]+`)/g;

    // 将字符串分割成代码块和非代码块部分
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(str)) !== null) {
      // 添加代码块前的文本（需要转义）
      if (match.index > lastIndex) {
        parts.push({
          text: str.substring(lastIndex, match.index),
          isCode: false,
        });
      }

      // 添加代码块（不需要转义）
      parts.push({
        text: match[0],
        isCode: true,
      });

      lastIndex = match.index + match[0].length;
    }

    // 添加最后一部分文本（如果有）
    if (lastIndex < str.length) {
      parts.push({
        text: str.substring(lastIndex),
        isCode: false,
      });
    }

    // 处理每个部分
    return parts
      .map((part) => {
        if (part.isCode) {
          // 代码块保持原样
          return part.text;
        } else {
          // 非代码块部分需要转义 HTML 标签
          return part.text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }
      })
      .join("");
  };

  // 处理正在思考的情况（只有开始标签）
  if (text.startsWith("<think>") && !text.includes("</think>")) {
    // 获取 <think> 后的所有内容
    const thinkContent = text.slice("<think>".length);

    // 保存开始时间到localStorage
    try {
      const thinkStartKey = `think_start_${thinkContent
        .substring(0, 50)
        .trim()}`;
      if (!localStorage.getItem(thinkStartKey)) {
        localStorage.setItem(thinkStartKey, Date.now().toString());
      }
    } catch (e) {
      console.error("保存思考开始时间出错:", e);
    }

    // 转义内容中的HTML标签，但保留代码块，然后给每一行添加引用符号
    const escapedContent = escapeHtmlPreserveCodeBlocks(thinkContent);
    const quotedContent = escapedContent
      .split("\n")
      .map((line: string) => (line.trim() ? `> ${line}` : ">"))
      .join("\n");

    return `<details open>
<summary>${Locale.NewChat.Thinking} <span class="thinking-loader"></span></summary>

${quotedContent}

</details>`;
  }

  // 处理完整的思考过程（有结束标签）
  const pattern = /^<think>([\s\S]*?)<\/think>/;
  return text.replace(pattern, (match, thinkContent) => {
    // 转义内容中的HTML标签，但保留代码块，然后给每一行添加引用符号
    const escapedContent = escapeHtmlPreserveCodeBlocks(thinkContent);
    const quotedContent = escapedContent
      .split("\n")
      .map((line: string) => (line.trim() ? `> ${line}` : ">"))
      .join("\n");

    // 获取思考用时
    const duration = handleThinkingTime(thinkContent);
    const durationText = duration ? Locale.NewChat.ThinkingTime(duration) : "";

    return `<details open>
<summary>${Locale.NewChat.Think}${durationText}</summary>

${quotedContent}

</details>`;
  });
}

function MarkdownContentComponent(props: { content: string }) {
  // 检测文件附件格式
  const detectFileAttachments = (content: string) => {
    const fileRegex =
      /文件名: (.+?)\n类型: (.+?)\n大小: (.+?) KB\n\n([\s\S]+?)(?=\n\n---|$)/g;
    let match;
    const files = [];

    while ((match = fileRegex.exec(content)) !== null) {
      files.push({
        fileName: match[1],
        fileType: match[2],
        fileSize: parseFloat(match[3]) * 1024, // 转换为字节
        content: match[4],
      });
    }

    return files;
  };

  // 替换文件内容为文件附件组件
  const replaceFileAttachments = (content: string) => {
    const files = detectFileAttachments(content);

    if (files.length === 0) {
      return content;
    }

    let newContent = content;

    // 使用更友好的链接文本
    files.forEach((file, index) => {
      // 创建一个安全的替换模式
      const fileMarker = `文件名: ${file.fileName}\n类型: ${
        file.fileType
      }\n大小: ${(file.fileSize / 1024).toFixed(2)} KB\n\n`;
      const replacement = `[📄 ${file.fileName}](file://${encodeURIComponent(
        file.fileName,
      )}?type=${encodeURIComponent(file.fileType)}&size=${file.fileSize})`;
      const startIndex = newContent.indexOf(fileMarker);

      if (startIndex >= 0) {
        // 找到文件内容的结束位置
        const contentStart = startIndex + fileMarker.length;
        let contentEnd = newContent.indexOf("\n\n---\n\n", contentStart);
        if (contentEnd < 0) contentEnd = newContent.length;

        // 使用特殊格式的 Markdown 链接，可以被 ReactMarkdown 正确处理
        newContent =
          newContent.substring(0, startIndex) +
          replacement +
          newContent.substring(contentEnd);
      }
    });

    return newContent;
  };

  const escapedContent = useMemo(() => {
    // 检查是否是 base64 图像数据
    try {
      // 尝试解析整个内容
      const jsonData = JSON.parse(props.content);
      if (jsonData.type === "base64_image") {
        // 如果有附加文本，添加到图像后面
        const textContent = jsonData.text ? `\n\n${jsonData.text}` : "";
        return `![Generated Image](${jsonData.data})${textContent}`;
      }
    } catch (e) {
      // 不是 JSON 格式，继续检查内容中是否包含 JSON 字符串

      // 尝试匹配完整的 JSON 字符串模式
      const jsonRegex = /(\{.*"type"\s*:\s*"base64_image".*?\})/;
      const jsonMatch = jsonRegex.exec(props.content);

      if (jsonMatch && jsonMatch[1]) {
        try {
          // 尝试解析匹配到的 JSON 字符串
          const jsonData = JSON.parse(jsonMatch[1]);
          if (jsonData.type === "base64_image" && jsonData.data) {
            // 分析原始内容，保持文本顺序
            const parts = props.content.split(jsonMatch[1]);
            const beforeText = parts[0] ? `${parts[0]}\n\n` : "";
            const afterText = parts[1] ? `\n\n${parts[1]}` : "";
            const imageText = jsonData.text ? `\n\n${jsonData.text}` : "";

            return `${beforeText}![Generated Image](${jsonData.data})${imageText}${afterText}`;
          }
        } catch (jsonError) {
          console.error("Failed to parse JSON in content:", jsonError);
        }
      }

      // 尝试其他正则表达式匹配
      const regex = /\{"type":"base64_image","data":"(data:[^"]+)".*?\}/g;
      const match = regex.exec(props.content);
      if (match && match[1]) {
        // 找到了 base64 图像数据
        return `![Generated Image](${match[1]})`;
      }

      // 尝试另一种格式
      const regex2 = /\{"data":"(data:[^"]+)","type":"base64_image".*?\}/g;
      const match2 = regex2.exec(props.content);
      if (match2 && match2[1]) {
        // 找到了 base64 图像数据
        return `![Generated Image](${match2[1]})`;
      }
    }

    const processedContent = replaceFileAttachments(props.content);
    return tryWrapHtmlCode(formatThinkText(escapeBrackets(processedContent)));
  }, [props.content]);

  return (
    <ReactMarkdown
      remarkPlugins={[RemarkMath, RemarkGfm, RemarkBreaks]}
      rehypePlugins={[
        RehypeRaw,
        RehypeKatex,
        [
          RehypeHighlight,
          {
            detect: false,
            ignoreMissing: true,
          },
        ],
      ]}
      components={{
        // 添加自定义组件处理
        a: (aProps) => {
          const href = aProps.href || "";

          // 检测并阻止javascript协议
          if (href.toLowerCase().startsWith("javascript:")) {
            // 简单地显示文本内容，不添加任何特殊样式或提示
            return <span>{aProps.children}</span>;
          }

          // 处理文件附件链接
          if (href.startsWith("file://")) {
            try {
              const url = new URL(href);
              const fileName = decodeURIComponent(url.pathname.substring(2)); // 去掉 '//'
              const fileType = url.searchParams.get("type") || "未知类型";
              const fileSize = parseFloat(url.searchParams.get("size") || "0");

              // 忽略链接文本，直接使用 FileAttachment 组件
              return (
                <FileAttachment
                  fileName={fileName}
                  fileType={fileType}
                  fileSize={fileSize}
                  onClick={() => {
                    try {
                      // 点击时显示文件内容
                      showToast("文件内容已复制到剪贴板");
                      // 使用更安全的方式查找文件内容
                      const fileMarker = `文件名: ${fileName}\n类型: ${fileType}\n大小: ${(
                        fileSize / 1024
                      ).toFixed(2)} KB\n\n`;
                      const startIndex = props.content.indexOf(fileMarker);

                      if (startIndex >= 0) {
                        const contentStart =
                          props.content.indexOf("\n\n", startIndex) + 2;
                        let contentEnd = props.content.indexOf(
                          "\n\n---\n\n",
                          contentStart,
                        );
                        if (contentEnd < 0) contentEnd = props.content.length;

                        const fileContent = props.content.substring(
                          contentStart,
                          contentEnd,
                        );
                        copyToClipboard(fileContent);
                      } else {
                        copyToClipboard("无法找到文件内容");
                      }
                    } catch (error) {
                      console.error("复制文件内容时出错:", error);
                      showToast("复制文件内容失败");
                    }
                  }}
                />
              );
            } catch (error) {
              console.error("解析文件附件链接出错:", error);
              return <span>文件附件加载失败</span>;
            }
          }

          // 处理音频链接
          if (/\.(aac|mp3|opus|wav)$/.test(href)) {
            return (
              <figure>
                <audio controls src={href}></audio>
              </figure>
            );
          }

          // 处理视频链接
          if (/\.(3gp|3g2|webm|ogv|mpeg|mp4|avi)$/.test(href)) {
            return (
              <video controls width="99.9%">
                <source src={href} />
              </video>
            );
          }

          // 处理其他安全链接
          const isInternal = /^\/#/i.test(href);
          const target = isInternal ? "_self" : aProps.target ?? "_blank";
          const rel = !isInternal ? "noopener noreferrer" : undefined;

          return <a {...aProps} href={href} target={target} rel={rel} />;
        },
        pre: PreCode,
        code: CustomCode,
        p: (pProps) => <p {...pProps} dir="auto" />,
        details: Details,
        summary: Summary,
      }}
    >
      {escapedContent}
    </ReactMarkdown>
  );
}

export const MarkdownContent = React.memo(MarkdownContentComponent);

export function Markdown(
  props: {
    content: string;
    loading?: boolean;
    fontSize?: number;
    fontFamily?: string;
    parentRef?: RefObject<HTMLDivElement>;
    defaultShow?: boolean;
    isUser?: boolean;
    messageId?: string;
  } & React.DOMAttributes<HTMLDivElement>,
) {
  const mdRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastContentRef = useRef(props.content);
  const lastScrollTopRef = useRef(0);

  // 添加token计数状态和首字延迟状态
  const [tokenInfo, setTokenInfo] = useState<{
    count: number;
    isUser: boolean;
    firstCharDelay?: number;
  } | null>(null);
  const tokenStartTimeRef = useRef<number | null>(null);
  const contentLengthRef = useRef<number>(0);
  const messageStartTimeRef = useRef<number | null>(null);
  const firstCharReceivedTimeRef = useRef<number | null>(null);

  // 添加鼠标悬停状态
  const [isHovering, setIsHovering] = useState(false);

  // 初始化消息发送时间
  useEffect(() => {
    if (props.loading && !props.isUser && !messageStartTimeRef.current) {
      // 记录消息开始请求的时间
      messageStartTimeRef.current = Date.now();

      // 保存到localStorage
      if (props.messageId) {
        localStorage.setItem(
          `msg_start_${props.messageId}`,
          messageStartTimeRef.current.toString(),
        );
      }
    }
  }, [props.loading, props.isUser, props.messageId]);

  // 修改token计算逻辑，添加首字延迟计算
  useEffect(() => {
    // 如果内容为空或正在加载，重置计时器
    if (!props.content || props.content.length === 0) {
      tokenStartTimeRef.current = null;
      contentLengthRef.current = 0;
      setTokenInfo(null);
      return;
    }

    try {
      // 只计算token数量，不计算速度
      const tokens = encode(props.content);
      const tokenCount = tokens.length;

      // 更新内容长度
      contentLengthRef.current = props.content.length;

      // 首字延迟计算
      let firstCharDelay: number | undefined = undefined;

      // 如果是AI回复且是第一次收到内容
      if (
        !props.isUser &&
        props.content.length > 0 &&
        !firstCharReceivedTimeRef.current
      ) {
        firstCharReceivedTimeRef.current = Date.now();

        // 计算延迟时间（毫秒）
        if (messageStartTimeRef.current) {
          firstCharDelay =
            firstCharReceivedTimeRef.current - messageStartTimeRef.current;

          // 保存到localStorage
          if (props.messageId) {
            localStorage.setItem(
              `first_char_delay_${props.messageId}`,
              firstCharDelay.toString(),
            );
          }
        }
      } else if (props.messageId) {
        // 尝试从localStorage获取已存储的延迟
        const storedDelay = localStorage.getItem(
          `first_char_delay_${props.messageId}`,
        );
        if (storedDelay) {
          firstCharDelay = parseInt(storedDelay);
        }
      }

      // 只设置token数量和首字延迟
      setTokenInfo({
        count: tokenCount,
        isUser: props.isUser ?? false,
        firstCharDelay,
      });
    } catch (e) {
      console.error("计算token出错:", e);
    }
  }, [props.content, props.loading, props.isUser, props.messageId]);

  // 检测是否滚动到底部
  const checkIfAtBottom = (target: HTMLDivElement) => {
    const threshold = 10;
    const bottomPosition =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    return bottomPosition <= threshold;
  };

  // 处理滚动事件
  useEffect(() => {
    const parent = props.parentRef?.current;
    if (!parent) return;

    const handleScroll = () => {
      lastScrollTopRef.current = parent.scrollTop;
      const isAtBottom = checkIfAtBottom(parent);
      setAutoScroll(isAtBottom);
    };

    parent.addEventListener("scroll", handleScroll);
    return () => parent.removeEventListener("scroll", handleScroll);
  }, [props.parentRef]);

  // 自动滚动效果
  useEffect(() => {
    const parent = props.parentRef?.current;
    if (!parent || props.content === lastContentRef.current) return;

    // 只有当之前开启了自动滚动，且内容发生变化时才滚动
    if (autoScroll) {
      parent.scrollTop = parent.scrollHeight;
    }

    lastContentRef.current = props.content;
  }, [props.content, props.parentRef, autoScroll]);

  // 确保在消息完成后仍能获取首字延迟
  useEffect(() => {
    // 当消息加载完成时，确保我们仍然能获取到首字延迟
    if (!props.loading && props.messageId && !props.isUser) {
      // 尝试从localStorage获取已存储的延迟
      const storedDelay = localStorage.getItem(
        `first_char_delay_${props.messageId}`,
      );

      if (storedDelay && tokenInfo) {
        // 确保tokenInfo中包含首字延迟
        if (!tokenInfo.firstCharDelay) {
          setTokenInfo({
            ...tokenInfo,
            firstCharDelay: parseInt(storedDelay),
          });
        }
      }
    }
  }, [props.loading, props.messageId, props.isUser, tokenInfo]);

  return (
    <div className="markdown-body-container" style={{ position: "relative" }}>
      <div
        className="markdown-body"
        style={{
          fontSize: `${props.fontSize ?? 14}px`,
          fontFamily: props.fontFamily || "inherit",
        }}
        ref={mdRef}
        onContextMenu={props.onContextMenu}
        onDoubleClickCapture={props.onDoubleClickCapture}
        dir="auto"
      >
        {props.loading ? (
          <LoadingIcon />
        ) : (
          <MarkdownContent content={props.content} />
        )}
      </div>

      {/* Token信息显示 */}
      {!props.loading && tokenInfo && (
        <div
          className="token-info"
          style={{
            position: "absolute",
            right: "0px",
            bottom: "-28px",
            fontSize: "12px",
            color: "var(--color-fg-subtle)",
            opacity: 0.8,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
          onMouseEnter={() => tokenInfo.firstCharDelay && setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onClick={() => {
            // 点击时切换显示状态
            if (tokenInfo.firstCharDelay) {
              setIsHovering(!isHovering);
            }
          }}
        >
          {isHovering && tokenInfo.firstCharDelay
            ? Locale.Chat.TokenInfo.FirstDelay(tokenInfo.firstCharDelay)
            : Locale.Chat.TokenInfo.TokenCount(tokenInfo.count)}
        </div>
      )}
    </div>
  );
}
