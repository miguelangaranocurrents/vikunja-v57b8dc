import type {Node as ProseMirrorNode, Schema, Slice} from '@tiptap/pm/model'
import {getTextBetween, getTextSerializersFromSchema} from '@tiptap/core'

const LIST_TYPES = ['bulletList', 'orderedList', 'taskList']
const INDENT = '  '

/**
 * Serializes a copied slice to plain text that keeps its structure readable:
 * one line per block and markdown style markers for list items, so pasting it
 * somewhere else doesn't flatten a list into loose lines.
 */
export function createClipboardTextSerializer(schema: Schema) {
	const textSerializers = getTextSerializersFromSchema(schema)

	function leafText(node: ProseMirrorNode): string {
		const serializer = textSerializers[node.type.name]
		if (serializer) {
			return serializer({node, pos: 0, parent: node, index: 0, range: {from: 0, to: 0}})
		}
		return node.isText ? node.text ?? '' : (node.type.spec.leafText?.(node) ?? '')
	}

	function textblockText(node: ProseMirrorNode): string {
		return getTextBetween(node, {from: 0, to: node.content.size}, {blockSeparator: '\n', textSerializers})
	}

	function serializeList(list: ProseMirrorNode, depth: number, lines: string[]) {
		let number = typeof list.attrs.start === 'number' ? list.attrs.start : 1
		const prefix = INDENT.repeat(depth)

		list.forEach(item => {
			let marker = '- '
			if (list.type.name === 'orderedList') {
				marker = `${number++}. `
			} else if (item.type.name === 'taskItem') {
				marker = item.attrs.checked ? '- [x] ' : '- [ ] '
			}

			let first = true
			item.forEach(child => {
				if (LIST_TYPES.includes(child.type.name)) {
					serializeList(child, depth + 1, lines)
					return
				}
				const childLines: string[] = []
				serializeBlock(child, childLines)
				for (const line of childLines) {
					lines.push(prefix + (first ? marker : ' '.repeat(marker.length)) + line)
					first = false
				}
			})
			if (first) {
				lines.push(prefix + marker.trimEnd())
			}
		})
	}

	function serializeBlock(node: ProseMirrorNode, lines: string[]) {
		if (LIST_TYPES.includes(node.type.name)) {
			serializeList(node, 0, lines)
		} else if (node.isTextblock) {
			lines.push(...textblockText(node).split('\n'))
		} else if (node.isLeaf) {
			lines.push(leafText(node))
		} else {
			node.forEach(child => serializeBlock(child, lines))
		}
	}

	return (slice: Slice): string => {
		const lines: string[] = []
		let inline = ''
		slice.content.forEach(node => {
			if (node.isInline) {
				inline += leafText(node)
				return
			}
			if (inline !== '') {
				lines.push(inline)
				inline = ''
			}
			serializeBlock(node, lines)
		})
		if (inline !== '') {
			lines.push(inline)
		}
		return lines.map(line => line.trimEnd()).join('\n')
	}
}
