/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import ts from 'typescript';

// **IMPORTANT** Changing the PLACEHOLDER_BLANK_LINE_COMMENT constant below is a
// breaking change and should probably never happen. This unique comment is
// documented in multiple locations, and users may have written tools that
// depend on it.

/**
 * The content of the comments generated by the preserveBlankLines transformer.
 *
 * Contains a fixed random string that is meaningless and serves only to make
 * the chance of collisions negligible.
 */
export const BLANK_LINE_PLACEHOLDER_COMMENT = `__BLANK_LINE_PLACEHOLDER_G1JVXUEBNCL6YN5NFE13MD1PT3H9OIHB__`;

/**
 * A regular expression that matches the comments generated by the
 * preserveBlankLines transformer, including the leading "//" and preceding
 * indentation.
 */
export const BLANK_LINE_PLACEHOLDER_COMMENT_REGEXP = new RegExp(
  `\\s*//${BLANK_LINE_PLACEHOLDER_COMMENT}`,
  'g'
);

/**
 * TypeScript transformer that replaces blank lines in the original source with
 * a unique comment, allowing original line formatting to be preserved after
 * transform using a simple search-and-replace.
 *
 * For example, given:
 *
 *   import 'foo';
 *
 *   class Foo {
 *     foo() {}
 *
 *     bar() {}
 *   }
 *
 * Produces:
 *
 *   import 'foo';
 *   //__BLANK_LINE_PLACEHOLDER_G1JVXUEBNCL6YN5NFE13MD1PT3H9OIHB__
 *   class Foo {
 *     foo() {}
 *     //__BLANK_LINE_PLACEHOLDER_G1JVXUEBNCL6YN5NFE13MD1PT3H9OIHB__
 *     bar() {}
 *   }
 *
 * These placeholder comments can be replaced with newlines after transform with
 * the `BLANK_LINE_PLACEHOLDER_COMMENT_REGEXP` regexp, or with any equivalent
 * search-and-replace operation for the comment style shown above.
 */
export function preserveBlankLinesTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    return (file) => {
      const sourceFileText = file.getFullText();
      if (!sourceFileText) {
        return file;
      }
      // SourceFile > SyntaxList > first child
      const firstChild = file.getChildAt(0).getChildAt(0);
      const transformer = new PreserveBlankLinesTransformer(
        sourceFileText,
        firstChild
      );
      const visit = (node: ts.Node): ts.VisitResult<ts.Node> => {
        transformer.addComments(node);
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(file, visit) as ts.SourceFile;
    };
  };
}

const BLANK_LINE = Symbol();

/**
 * We create one of these per file.
 */
class PreserveBlankLinesTransformer {
  private readonly _sourceFileText: string;
  private readonly _firstChild: ts.Node;
  private readonly _handledTriviaRanges = new Set<string>();
  private readonly _deletedTriviaRanges = new Set<string>();

  constructor(sourceFileText: string, firstChild: ts.Node) {
    this._sourceFileText = sourceFileText;
    this._firstChild = firstChild;
  }

  addComments(node: ts.Node): void {
    if (ts.isSourceFile(node)) {
      // Source files get the same trivia as the first child, but it is not
      // possible to remove existing trivia nor add synthetic comments to a
      // source file (it has no effect). Skip it so that we handle leading
      // trivia from the first child instead.
      return;
    }

    // The same trivia range can be associated with multiple AST nodes. For
    // example, `let x=0` is represented as VariableStatement >
    // VariableDeclarationList, where both have the same trivia range. We must
    // only handle each trivia range once, otherwise we'll emit duplicate
    // comments.
    const triviaRangeKey = `${node.getFullStart()}:${node.getStart()}`;
    if (this._handledTriviaRanges.has(triviaRangeKey)) {
      // If we delete a trivia range from one node, but not the other, the
      // trivia will still be emitted. So, we must delete the range from every
      // node it is associated with.
      if (this._deletedTriviaRanges.has(triviaRangeKey)) {
        deleteTriviaRange(node);
      }
      return;
    }
    this._handledTriviaRanges.add(triviaRangeKey);

    // Multiple leading comments can be associated with a node, and there can be
    // blank lines before or after any of them.
    const newComments: Array<ts.CommentRange | typeof BLANK_LINE> = [];
    const existingComments =
      ts.getLeadingCommentRanges(this._sourceFileText, node.getFullStart()) ??
      [];
    let anyBlankLinesToAdd = false;
    let anyExistingCommentsToResynthesize = false;

    // Each of the existing comments.
    let previousRegionEnd = node.getFullStart();
    for (const comment of existingComments) {
      if (node !== this._firstChild) {
        const leadingWhitespace = this._sourceFileText.slice(
          previousRegionEnd,
          comment.pos
        );
        for (let i = 0; i < countBlankLines(leadingWhitespace); i++) {
          newComments.push(BLANK_LINE);
          anyBlankLinesToAdd = true;
        }
        newComments.push(comment);
        anyExistingCommentsToResynthesize = true;
      }
      // If this is the first child node, we are restricted in what we can do,
      // because the source file node has the same trivia as the first child,
      // and there is no way to prevent it from being emitted (the
      // `deleteTriviaRange` trick doesn't work). This means we can't preserve
      // blank lines before or between leading comments at start of the file --
      // but we can at least preserve blank lines after those leading comments.
      previousRegionEnd = comment.end;
    }

    // The remaining trivia after the last existing comment (or the entire
    // trivia if there weren't any existing comments).
    if (previousRegionEnd < node.getStart()) {
      const postCommentText = this._sourceFileText.slice(
        previousRegionEnd,
        node.getStart()
      );
      for (let i = 0; i < countBlankLines(postCommentText); i++) {
        newComments.push(BLANK_LINE);
        anyBlankLinesToAdd = true;
      }
    }

    if (!anyBlankLinesToAdd) {
      return;
    }

    // The TypeScript APIs around manipulating comments are a bit crude.
    // Original source comments are represented differently to "synthetic"
    // comments (ones created during a transform). We don't have the ability to
    // insert a comment before or between existing source comments, so we
    // instead delete all of the source trivia, and then reconstruct all of the
    // original comments + new blank line comments as synthetic comments.
    if (anyExistingCommentsToResynthesize) {
      deleteTriviaRange(node);
      this._deletedTriviaRanges.add(triviaRangeKey);
    }

    for (const comment of newComments) {
      if (comment === BLANK_LINE) {
        ts.addSyntheticLeadingComment(
          node,
          ts.SyntaxKind.SingleLineCommentTrivia,
          BLANK_LINE_PLACEHOLDER_COMMENT,
          /* trailing newline */ true
        );
      } else {
        const commentText = this._sourceFileText.slice(
          comment.pos + 2, // trim the leading "//" or "/*"
          comment.kind === ts.SyntaxKind.MultiLineCommentTrivia
            ? comment.end - 2 // trim the trailing "*/"
            : comment.end
        );
        ts.addSyntheticLeadingComment(
          node,
          comment.kind,
          commentText,
          comment.hasTrailingNewLine
        );
      }
    }
  }
}

const countBlankLines = (str: string) => {
  let newLines = 0;
  for (const char of str) {
    if (char === '\n') {
      newLines++;
    }
  }
  return Math.max(0, newLines - 1);
};

/**
 * A trick for removing original source trivia from the AST.
 */
const deleteTriviaRange = (node: ts.Node) =>
  ts.setTextRange(node, {pos: node.getStart(), end: node.getEnd()});
