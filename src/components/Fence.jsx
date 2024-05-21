'use client'

import { Fragment } from 'react'
import { Prism as Highlight } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function Fence({ children, language }) {
  return (
    <Highlight
      code={children.trimEnd()}
      language={language}
      style={atomDark}
      customStyle={{ backgroundColor: "transparent", opacity: "1", marginTop: "-1rem" }}
    >
      {({ className, style, tokens, getTokenProps }) => (
        <pre className={className} style={style}>
          <code>
            {tokens.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {line
                  .filter((token) => !token.empty)
                  .map((token, tokenIndex) => (
                    <span key={tokenIndex} {...getTokenProps({ token })} />
                  ))}
                {'\n'}
              </Fragment>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  )
}
