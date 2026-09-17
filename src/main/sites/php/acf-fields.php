<?php
/**
 * Muster ACF field get/preview/apply runner. Loaded by `wp eval-file`.
 * Payload JSON path is $args[0] (WP-CLI) or $argv[1] (php CLI).
 */

function muster_acf_payload_path() {
	$cli = isset( $GLOBALS['muster_acf_cli_args'] ) && is_array( $GLOBALS['muster_acf_cli_args'] )
		? $GLOBALS['muster_acf_cli_args']
		: array();
	return isset( $cli[0] ) && is_string( $cli[0] ) ? $cli[0] : '';
}

function muster_acf_parse_path( $path ) {
	if ( ! is_string( $path ) || $path === '' ) {
		return array( 'error' => 'path is empty.' );
	}
	if ( $path[0] === '.' || substr( $path, -1 ) === '.' || strpos( $path, '..' ) !== false ) {
		return array( 'error' => "invalid path '{$path}'." );
	}
	$parts    = explode( '.', $path );
	$segments = array();
	foreach ( $parts as $i => $part ) {
		if ( $part === '' ) {
			return array( 'error' => "invalid path '{$path}'." );
		}
		if ( preg_match( '/^[0-9]+$/', $part ) ) {
			if ( $i === 0 ) {
				return array( 'error' => 'path cannot start with a row index.' );
			}
			$segments[] = array(
				'kind'  => 'index',
				'index' => intval( $part, 10 ),
				'name'  => $part,
			);
			continue;
		}
		if ( ! preg_match( '/^[A-Za-z_][A-Za-z0-9_]*$/', $part ) ) {
			return array( 'error' => "invalid path segment '{$part}'." );
		}
		$segments[] = array(
			'kind' => 'field',
			'name' => $part,
		);
	}
	return array( 'segments' => $segments );
}

function muster_acf_set_by_trace( $root, $trace, $value ) {
	if ( count( $trace ) === 0 ) {
		return $value;
	}
	$cur  = &$root;
	$last = count( $trace ) - 1;
	foreach ( $trace as $i => $key ) {
		if ( $i === $last ) {
			$cur[ $key ] = $value;
			break;
		}
		if ( ! isset( $cur[ $key ] ) || ! is_array( $cur[ $key ] ) ) {
			$cur[ $key ] = array();
		}
		$cur = &$cur[ $key ];
	}
	return $root;
}

/**
 * Compares two values already put through muster_acf_normalise().
 * Absent, null and '' are the same state in ACF storage, so they compare equal.
 */
function muster_acf_same( $left, $right ) {
	if ( is_array( $left ) && is_array( $right ) ) {
		$keys = array_unique( array_merge( array_keys( $left ), array_keys( $right ) ) );
		foreach ( $keys as $key ) {
			$a = array_key_exists( $key, $left ) ? $left[ $key ] : null;
			$b = array_key_exists( $key, $right ) ? $right[ $key ] : null;
			if ( ! muster_acf_same( $a, $b ) ) {
				return false;
			}
		}
		return true;
	}
	if ( is_array( $left ) || is_array( $right ) ) {
		$array = is_array( $left ) ? $left : $right;
		$other = is_array( $left ) ? $right : $left;
		return count( $array ) === 0 && ( $other === null || $other === '' );
	}
	if ( ( $left === null || $left === '' ) && ( $right === null || $right === '' ) ) {
		return true;
	}
	if ( is_scalar( $left ) && is_scalar( $right ) ) {
		return (string) $left === (string) $right;
	}
	return $left === $right;
}

function muster_acf_get_by_trace( $root, $trace ) {
	$cur = $root;
	foreach ( $trace as $key ) {
		if ( ! is_array( $cur ) || ! array_key_exists( $key, $cur ) ) {
			return array(
				'ok'    => false,
				'value' => null,
			);
		}
		$cur = $cur[ $key ];
	}
	return array(
		'ok'    => true,
		'value' => $cur,
	);
}

function muster_acf_home() {
	return function_exists( 'get_option' ) ? get_option( 'home' ) : null;
}

function muster_acf_version() {
	return function_exists( 'acf_get_setting' ) ? acf_get_setting( 'version' ) : null;
}

function muster_acf_is_value_type( $type ) {
	return ! in_array( $type, array( 'tab', 'accordion', 'message' ), true );
}

/** ACF's own predicates are prefix checks; mirror them so the walker still works without WordPress. */
function muster_acf_is_field_key( $id ) {
	if ( function_exists( 'acf_is_field_key' ) ) {
		return (bool) acf_is_field_key( $id );
	}
	return is_string( $id ) && strpos( $id, 'field_' ) === 0;
}

function muster_acf_is_group_key( $id ) {
	if ( function_exists( 'acf_is_field_group_key' ) ) {
		return (bool) acf_is_field_group_key( $id );
	}
	return is_string( $id ) && strpos( $id, 'group_' ) === 0;
}

/**
 * Returns the parent FIELD array when $parent points at one, false when it points at a group.
 * Local fields carry a key, DB fields a post ID; a group post ID resolves to false in ACF.
 */
function muster_acf_parent_field( $parent ) {
	if ( ! function_exists( 'acf_get_field' ) ) {
		return false;
	}
	if ( $parent === null || $parent === '' || $parent === 0 || $parent === '0' ) {
		return false;
	}
	if ( muster_acf_is_group_key( $parent ) ) {
		return false;
	}
	if ( ! muster_acf_is_field_key( $parent ) && ! is_numeric( $parent ) ) {
		return false;
	}
	$field = acf_get_field( $parent );
	return is_array( $field ) ? $field : false;
}

/** Walks up `parent` to the owning field group; `location` rules live there, never on a field. */
function muster_acf_owning_group( $field ) {
	if ( ! function_exists( 'acf_get_field_group' ) || ! is_array( $field ) ) {
		return false;
	}
	$cursor = $field;
	for ( $depth = 0; $depth < 10; $depth++ ) {
		$parent = isset( $cursor['parent'] ) ? $cursor['parent'] : 0;
		if ( $parent === null || $parent === '' || $parent === 0 || $parent === '0' ) {
			return false;
		}
		$parent_field = muster_acf_parent_field( $parent );
		if ( is_array( $parent_field ) ) {
			$cursor = $parent_field;
			continue;
		}
		$group = acf_get_field_group( $parent );
		return is_array( $group ) ? $group : false;
	}
	return false;
}

function muster_acf_field_is_block( $field ) {
	$group    = muster_acf_owning_group( $field );
	$location = is_array( $group ) && isset( $group['location'] ) && is_array( $group['location'] ) ? $group['location'] : array();
	foreach ( $location as $rule_group ) {
		if ( ! is_array( $rule_group ) ) {
			continue;
		}
		foreach ( $rule_group as $rule ) {
			if ( is_array( $rule ) && isset( $rule['param'] ) && $rule['param'] === 'block' ) {
				return true;
			}
		}
	}
	return false;
}

function muster_acf_layout_subfields( $parent, $layout_name = null ) {
	$subs = isset( $parent['sub_fields'] ) && is_array( $parent['sub_fields'] ) ? $parent['sub_fields'] : array();
	if ( isset( $parent['type'] ) && $parent['type'] === 'flexible_content' && is_string( $layout_name ) && $layout_name !== '' ) {
		$subs    = array();
		$layouts = isset( $parent['layouts'] ) && is_array( $parent['layouts'] ) ? $parent['layouts'] : array();
		foreach ( $layouts as $layout ) {
			if ( isset( $layout['name'] ) && $layout['name'] === $layout_name ) {
				$subs = isset( $layout['sub_fields'] ) && is_array( $layout['sub_fields'] ) ? $layout['sub_fields'] : array();
				break;
			}
		}
	}
	$out = array();
	foreach ( $subs as $sub ) {
		if ( ! is_array( $sub ) ) {
			continue;
		}
		$out[] = $sub;
		if ( isset( $sub['type'] ) && $sub['type'] === 'clone' && isset( $sub['sub_fields'] ) && is_array( $sub['sub_fields'] ) ) {
			foreach ( $sub['sub_fields'] as $cloned ) {
				if ( is_array( $cloned ) ) {
					$out[] = $cloned;
				}
			}
		}
	}
	return $out;
}

function muster_acf_find_subfield( $parent, $name, $layout_name = null ) {
	foreach ( muster_acf_layout_subfields( $parent, $layout_name ) as $sub ) {
		if ( ( isset( $sub['name'] ) && $sub['name'] === $name ) || ( isset( $sub['key'] ) && $sub['key'] === $name ) ) {
			return $sub;
		}
	}
	return null;
}

/**
 * Unformatted repeater/flex rows are keyed by field KEY. Formatted rows use the field name.
 * Prefer the slot that actually exists so reads and writes hit the same cell.
 */
function muster_acf_value_slot( $row, $sub ) {
	$fallback = isset( $sub['name'] ) ? $sub['name'] : '';
	if ( ! is_array( $row ) || ! is_array( $sub ) ) {
		return array(
			'found' => false,
			'value' => null,
			'slot'  => $fallback,
		);
	}
	foreach ( array( 'key', 'name' ) as $prop ) {
		if ( empty( $sub[ $prop ] ) || ! array_key_exists( $sub[ $prop ], $row ) ) {
			continue;
		}
		return array(
			'found' => true,
			'value' => $row[ $sub[ $prop ] ],
			'slot'  => $sub[ $prop ],
		);
	}
	return array(
		'found' => false,
		'value' => null,
		'slot'  => $fallback,
	);
}

/**
 * Canonical shape for comparison. Rows arrive keyed by name from the agent and by key from ACF,
 * and ACF re-reads scalars as strings, so both sides are rebuilt key-keyed with string leaves.
 */
function muster_acf_normalise( $field, $value ) {
	$type = is_array( $field ) && isset( $field['type'] ) ? $field['type'] : '';
	if ( $type === 'repeater' || $type === 'flexible_content' ) {
		if ( ! is_array( $value ) ) {
			return muster_acf_normalise_plain( $value );
		}
		$rows = array();
		foreach ( $value as $row ) {
			$rows[] = muster_acf_normalise_row( $field, $row );
		}
		return $rows;
	}
	if ( $type === 'group' ) {
		return is_array( $value ) ? muster_acf_normalise_row( $field, $value ) : muster_acf_normalise_plain( $value );
	}
	return muster_acf_normalise_plain( $value );
}

/** A path ending in a row index addresses one row of $field, not the field's whole value. */
function muster_acf_normalise_at( $field, $is_row, $value ) {
	return $is_row ? muster_acf_normalise_row( $field, $value ) : muster_acf_normalise( $field, $value );
}

function muster_acf_normalise_row( $parent, $row ) {
	if ( ! is_array( $row ) ) {
		return muster_acf_normalise_plain( $row );
	}
	$type   = isset( $parent['type'] ) ? $parent['type'] : '';
	$layout = isset( $row['acf_fc_layout'] ) && is_string( $row['acf_fc_layout'] ) ? $row['acf_fc_layout'] : null;
	$out    = array();
	if ( $type === 'flexible_content' ) {
		$out['acf_fc_layout'] = $layout;
	}
	foreach ( muster_acf_layout_subfields( $parent, $layout ) as $sub ) {
		$slot = muster_acf_value_slot( $row, $sub );
		if ( ! $slot['found'] ) {
			continue;
		}
		$key = ! empty( $sub['key'] ) ? $sub['key'] : ( isset( $sub['name'] ) ? $sub['name'] : '' );
		if ( $key === '' ) {
			continue;
		}
		$out[ $key ] = muster_acf_normalise( $sub, $slot['value'] );
	}
	return $out;
}

function muster_acf_normalise_plain( $value ) {
	if ( is_array( $value ) ) {
		$out = array();
		foreach ( $value as $key => $item ) {
			$out[ $key ] = muster_acf_normalise_plain( $item );
		}
		return $out;
	}
	if ( is_object( $value ) ) {
		$id = muster_acf_object_id( $value );
		return $id === null ? $value : (string) $id;
	}
	if ( $value === null ) {
		return null;
	}
	if ( is_bool( $value ) ) {
		return $value ? '1' : '0';
	}
	return is_scalar( $value ) ? (string) $value : $value;
}

function muster_acf_load_root_value( $field, $post_id ) {
	if ( ! function_exists( 'get_field' ) || ! is_array( $field ) ) {
		return null;
	}
	$type    = isset( $field['type'] ) ? $field['type'] : '';
	$is_rows = in_array( $type, array( 'repeater', 'flexible_content', 'group' ), true );
	foreach ( array( 'name', 'key' ) as $prop ) {
		if ( empty( $field[ $prop ] ) ) {
			continue;
		}
		$raw = get_field( $field[ $prop ], $post_id, false );
		if ( $is_rows ) {
			if ( is_array( $raw ) ) {
				return $raw;
			}
			// A bare row count means no sub-fields are registered; formatted values must never reach old/new.
			continue;
		}
		if ( $raw !== false && $raw !== null ) {
			return $raw;
		}
	}
	return $is_rows ? array() : null;
}

function muster_acf_write_root( $field, $value, $post_id ) {
	if ( ! function_exists( 'update_field' ) || ! is_array( $field ) ) {
		return false;
	}
	// Key form so ACF writes the _field_* reference row. One call only: `acf/update_value` must not fire twice.
	$selector = ! empty( $field['key'] ) ? $field['key'] : ( isset( $field['name'] ) ? $field['name'] : '' );
	if ( $selector === '' ) {
		return false;
	}
	return update_field( $selector, $value, $post_id );
}

function muster_acf_subfield_names( $parent, $layout_name = null ) {
	$names = array();
	foreach ( muster_acf_layout_subfields( $parent, $layout_name ) as $sub ) {
		if ( isset( $sub['name'] ) ) {
			$names[] = $sub['name'];
		}
	}
	return $names;
}

function muster_acf_resolve_post_id( $target ) {
	if ( ! is_array( $target ) || ! isset( $target['kind'] ) || ! is_string( $target['kind'] ) ) {
		return array( 'error' => 'target.kind is required.' );
	}
	$kind = $target['kind'];
	$id   = isset( $target['id'] ) ? $target['id'] : null;
	if ( $kind === 'options' ) {
		$kind = 'option';
	}
	if ( $kind === 'option' ) {
		if ( $id === null || $id === '' ) {
			return array( 'post_id' => 'option' );
		}
		if ( is_string( $id ) || is_int( $id ) ) {
			return array( 'post_id' => (string) $id );
		}
		return array( 'error' => 'target.id for option must be a string.' );
	}
	if ( ! in_array( $kind, array( 'post', 'term', 'user', 'comment' ), true ) ) {
		return array( 'error' => "unknown target.kind '{$kind}'." );
	}
	if ( $id === null || $id === '' || ! is_numeric( $id ) ) {
		return array( 'error' => "target.id is required for kind '{$kind}'." );
	}
	$n = intval( $id, 10 );
	if ( $kind === 'post' ) {
		if ( function_exists( 'get_post' ) && ! get_post( $n ) ) {
			return array( 'error' => "post {$n} does not exist." );
		}
		return array( 'post_id' => $n );
	}
	if ( $kind === 'term' ) {
		if ( function_exists( 'get_term' ) && ( ! get_term( $n ) || is_wp_error( get_term( $n ) ) ) ) {
			return array( 'error' => "term {$n} does not exist." );
		}
		return array( 'post_id' => 'term_' . $n );
	}
	if ( $kind === 'user' ) {
		if ( function_exists( 'get_user_by' ) && ! get_user_by( 'id', $n ) ) {
			return array( 'error' => "user {$n} does not exist." );
		}
		return array( 'post_id' => 'user_' . $n );
	}
	if ( function_exists( 'get_comment' ) && ! get_comment( $n ) ) {
		return array( 'error' => "comment {$n} does not exist." );
	}
	return array( 'post_id' => 'comment_' . $n );
}

function muster_acf_attachment_id( $value, &$warnings, $label ) {
	if ( is_int( $value ) || ( is_float( $value ) && (int) $value == $value ) ) {
		return array( (int) $value, null );
	}
	if ( is_string( $value ) && ctype_digit( $value ) ) {
		return array( (int) $value, null );
	}
	if ( is_array( $value ) ) {
		$id = isset( $value['ID'] ) ? $value['ID'] : ( isset( $value['id'] ) ? $value['id'] : null );
		if ( is_numeric( $id ) ) {
			$warnings[] = "{$label}: sent formatted value, wrote ID";
			return array( (int) $id, null );
		}
	}
	if ( is_string( $value ) && function_exists( 'attachment_url_to_postid' ) ) {
		$id = attachment_url_to_postid( $value );
		if ( $id ) {
			$warnings[] = "{$label}: resolved attachment URL to ID";
			return array( (int) $id, null );
		}
		return array( null, "{$label}: could not resolve attachment URL" );
	}
	return array( null, "{$label}: expected attachment ID" );
}

function muster_acf_object_id( $value ) {
	if ( is_numeric( $value ) ) {
		return (int) $value;
	}
	if ( is_array( $value ) ) {
		if ( isset( $value['ID'] ) && is_numeric( $value['ID'] ) ) {
			return (int) $value['ID'];
		}
		if ( isset( $value['id'] ) && is_numeric( $value['id'] ) ) {
			return (int) $value['id'];
		}
	}
	if ( is_object( $value ) && isset( $value->ID ) ) {
		return (int) $value->ID;
	}
	return null;
}

function muster_acf_coerce_row( $parent, $value, &$warnings, $path ) {
	$type = isset( $parent['type'] ) ? $parent['type'] : '';
	if ( ! is_array( $value ) ) {
		return array( null, "{$path}: a {$type} row expects an object; rewrite the whole field to add or remove rows." );
	}
	if ( $type === 'flexible_content' && empty( $value['acf_fc_layout'] ) ) {
		return array( null, "{$path}: a flexible row needs acf_fc_layout." );
	}
	return array( $value, null );
}

function muster_acf_coerce( $field, $value, &$warnings, $path ) {
	$type = isset( $field['type'] ) ? $field['type'] : '';
	if ( ! muster_acf_is_value_type( $type ) ) {
		return array( null, "{$path}: '{$type}' is not a value field." );
	}
	// ACF deletes the cell on a null; it is the only way to clear an image or a link.
	if ( $value === null ) {
		$warnings[] = "{$path}: null clears the value";
		return array( null, null );
	}
	$multiple = ! empty( $field['multiple'] );
	switch ( $type ) {
		case 'true_false':
			if ( is_bool( $value ) ) {
				$warnings[] = "{$path}: coerced true_false";
				return array( $value ? 1 : 0, null );
			}
			if ( $value === 0 || $value === 1 || $value === '0' || $value === '1' ) {
				$warnings[] = "{$path}: coerced true_false";
				return array( (int) $value, null );
			}
			return array( null, "{$path}: true_false expects bool or 0/1." );
		case 'number':
		case 'range':
			if ( is_numeric( $value ) ) {
				if ( is_string( $value ) ) {
					$warnings[] = "{$path}: coerced number";
				}
				return array( 0 + $value, null );
			}
			return array( null, "{$path}: expected a number." );
		case 'image':
		case 'file':
			return muster_acf_attachment_id( $value, $warnings, $path );
		case 'gallery':
			if ( ! is_array( $value ) ) {
				return array( null, "{$path}: gallery expects an array of IDs." );
			}
			$ids = array();
			foreach ( $value as $item ) {
				list( $id, $err ) = muster_acf_attachment_id( $item, $warnings, $path );
				if ( $err ) {
					return array( null, $err );
				}
				$ids[] = $id;
			}
			return array( $ids, null );
		case 'post_object':
		case 'relationship':
		case 'page_link':
		case 'user':
		case 'taxonomy':
			$want_array = $multiple || $type === 'relationship';
			if ( $type === 'taxonomy' && ! empty( $field['field_type'] ) && in_array( $field['field_type'], array( 'multi_select', 'checkbox' ), true ) ) {
				$want_array = true;
			}
			$items     = $want_array ? ( is_array( $value ) ? $value : array( $value ) ) : array( $value );
			$ids       = array();
			$formatted = false;
			foreach ( $items as $item ) {
				$id = muster_acf_object_id( $item );
				if ( $id === null ) {
					return array( null, "{$path}: expected ID(s)." );
				}
				if ( is_array( $item ) || is_object( $item ) ) {
					$formatted = true;
				}
				$ids[] = $id;
			}
			if ( $formatted ) {
				$warnings[] = "{$path}: sent formatted value, wrote ID";
			}
			return array( $want_array ? $ids : $ids[0], null );
		case 'select':
		case 'checkbox':
		case 'radio':
		case 'button_group':
			if ( $type === 'checkbox' || $multiple ) {
				return array( is_array( $value ) ? $value : array( $value ), null );
			}
			return array( $value, null );
		case 'link':
			if ( ! is_array( $value ) || ! isset( $value['url'] ) ) {
				return array( null, "{$path}: link expects {title, url, target}." );
			}
			return array( $value, null );
		case 'google_map':
			if ( ! is_array( $value ) || ! isset( $value['lat'] ) || ! isset( $value['lng'] ) ) {
				return array( null, "{$path}: google_map expects {address, lat, lng}." );
			}
			return array( $value, null );
		case 'date_picker':
			if ( is_string( $value ) && preg_match( '/^\d{8}$/', $value ) ) {
				return array( $value, null );
			}
			if ( is_string( $value ) && strtotime( $value ) !== false ) {
				$out          = gmdate( 'Ymd', strtotime( $value ) );
				$warnings[] = "{$path}: date_picker rewritten to {$out}";
				return array( $out, null );
			}
			return array( null, "{$path}: date_picker expects Ymd." );
		case 'repeater':
		case 'flexible_content':
		case 'group':
			if ( ! is_array( $value ) ) {
				return array( null, "{$path}: {$type} expects an array/object." );
			}
			if ( $type === 'flexible_content' ) {
				foreach ( $value as $row ) {
					if ( ! is_array( $row ) || empty( $row['acf_fc_layout'] ) ) {
						return array( null, "{$path}: each flexible row needs acf_fc_layout." );
					}
				}
			}
			return array( $value, null );
		case 'text':
		case 'textarea':
		case 'wysiwyg':
		case 'email':
		case 'url':
		case 'oembed':
		case 'password':
		case 'color_picker':
		case 'date_time_picker':
		case 'time_picker':
			if ( ! is_string( $value ) && ! is_numeric( $value ) ) {
				return array( null, "{$path}: expected a string." );
			}
			return array( is_string( $value ) ? $value : (string) $value, null );
		default:
			$warnings[] = "{$path}: unvalidated custom type '{$type}'";
			return array( $value, null );
	}
}

function muster_acf_walk( $root_field, $root_value, $segments, $mode ) {
	$cursor_field  = $root_field;
	$cursor_value  = $root_value;
	$layout        = null;
	$leaf_is_row   = false;
	$trace         = array();
	$field_info    = array(
		'name'          => isset( $root_field['name'] ) ? $root_field['name'] : '',
		'key'           => isset( $root_field['key'] ) ? $root_field['key'] : '',
		'type'          => isset( $root_field['type'] ) ? $root_field['type'] : '',
		'parent_layout' => null,
	);
	$count         = count( $segments );
	for ( $i = 1; $i < $count; $i++ ) {
		$seg = $segments[ $i ];
		if ( $seg['kind'] === 'index' ) {
			$type = isset( $cursor_field['type'] ) ? $cursor_field['type'] : '';
			if ( ! in_array( $type, array( 'repeater', 'flexible_content' ), true ) ) {
				return array( 'error' => "row index is not valid on a {$type} field." );
			}
			if ( ! is_array( $cursor_value ) ) {
				$cursor_value = array();
			}
			$row_count = count( $cursor_value );
			if ( $seg['index'] < 0 || $seg['index'] >= $row_count ) {
				return array(
					'error'  => "index {$seg['index']} out of range (count={$row_count}).",
					'exists' => false,
					'count'  => $row_count,
				);
			}
			$trace[]      = $seg['index'];
			$leaf_is_row  = true;
			$cursor_value = $cursor_value[ $seg['index'] ];
			$layout       = is_array( $cursor_value ) && isset( $cursor_value['acf_fc_layout'] ) ? $cursor_value['acf_fc_layout'] : null;
			$field_info['parent_layout'] = $layout;
			continue;
		}
		$sub = muster_acf_find_subfield( $cursor_field, $seg['name'], $layout );
		if ( ! $sub ) {
			$available = muster_acf_subfield_names( $cursor_field, $layout );
			$where     = $layout ? "layout '{$layout}'" : ( isset( $cursor_field['name'] ) ? $cursor_field['name'] : 'field' );
			return array(
				'error' => "subfield '{$seg['name']}' not found on {$where}. Available: " . implode( ', ', $available ),
			);
		}
		if ( ! muster_acf_is_value_type( isset( $sub['type'] ) ? $sub['type'] : '' ) ) {
			return array( 'error' => "'{$seg['name']}' is not a value field." );
		}
		$cursor_field = $sub;
		$leaf_is_row  = false;
		$slot         = muster_acf_value_slot( is_array( $cursor_value ) ? $cursor_value : array(), $sub );
		$trace[]      = $slot['slot'];
		$cursor_value = $slot['found'] ? $slot['value'] : null;
		$layout       = null;
		$field_info   = array(
			'name'          => isset( $sub['name'] ) ? $sub['name'] : $seg['name'],
			'key'           => isset( $sub['key'] ) ? $sub['key'] : '',
			'type'          => isset( $sub['type'] ) ? $sub['type'] : '',
			'parent_layout' => $field_info['parent_layout'],
		);
	}
	return array(
		'field' => $field_info,
		'leaf_field' => $cursor_field,
		'leaf_is_row' => $leaf_is_row,
		'value' => $cursor_value,
		'trace' => $trace,
		'exists' => true,
	);
}

function muster_acf_envelope( $ok, $extra = array() ) {
	return array_merge(
		array(
			'ok'          => $ok,
			'home'        => muster_acf_home(),
			'acf_version' => muster_acf_version(),
			'warnings'    => array(),
			'results'     => array(),
		),
		$extra
	);
}

function muster_acf_run( $payload ) {
	if ( ! function_exists( 'acf_get_field' ) ) {
		return muster_acf_envelope(
			false,
			array(
				'error' => 'ACF is not active on this WordPress.',
			)
		);
	}
	$mode   = isset( $payload['mode'] ) ? $payload['mode'] : 'get';
	$apply  = $mode === 'apply';
	$target = isset( $payload['target'] ) ? $payload['target'] : array();
	$items  = isset( $payload['fields'] ) && is_array( $payload['fields'] ) ? $payload['fields'] : array();
	$resolved = muster_acf_resolve_post_id( $target );
	if ( isset( $resolved['error'] ) ) {
		return muster_acf_envelope( false, array( 'error' => $resolved['error'] ) );
	}
	$post_id     = $resolved['post_id'];
	$results     = array();
	$warnings    = array();
	$roots       = array();
	$path_errors = false;

	foreach ( $items as $item ) {
		$path = is_array( $item ) && isset( $item['path'] ) ? $item['path'] : ( is_string( $item ) ? $item : '' );
		$parsed = muster_acf_parse_path( $path );
		if ( isset( $parsed['error'] ) ) {
			$path_errors = true;
			$results[]   = array(
				'path'   => $path,
				'exists' => false,
				'error'  => $parsed['error'],
			);
			continue;
		}
		$segments = $parsed['segments'];
		$root_name = $segments[0]['name'];
		$root_field = acf_get_field( $root_name );
		if ( ! $root_field ) {
			$path_errors = true;
			$results[]   = array(
				'path'   => $path,
				'exists' => false,
				'error'  => "field '{$root_name}' is not registered on this WordPress (home=" . ( muster_acf_home() ? muster_acf_home() : '?' ) . ').',
			);
			continue;
		}
		if ( muster_acf_field_is_block( $root_field ) ) {
			$path_errors = true;
			$results[]   = array(
				'path'   => $path,
				'exists' => false,
				'error'  => "field '{$root_name}' is an ACF block field; Gutenberg blocks live in post_content and are not updated.",
			);
			continue;
		}
		// acf_get_field() resolves sub-field names too; addressing one as a root writes a stray top-level meta row.
		$owner = muster_acf_parent_field( isset( $root_field['parent'] ) ? $root_field['parent'] : 0 );
		if ( is_array( $owner ) ) {
			$owner_name = isset( $owner['name'] ) ? $owner['name'] : '';
			$owner_type = isset( $owner['type'] ) ? $owner['type'] : '';
			$dotted     = in_array( $owner_type, array( 'repeater', 'flexible_content' ), true )
				? "{$owner_name}.<row>.{$root_name}"
				: "{$owner_name}.{$root_name}";
			$path_errors = true;
			$results[]   = array(
				'path'   => $path,
				'exists' => false,
				'error'  => "'{$root_name}' is a sub-field of '{$owner_name}'; address it as {$dotted}",
			);
			continue;
		}
		if ( ! muster_acf_is_value_type( isset( $root_field['type'] ) ? $root_field['type'] : '' ) ) {
			$path_errors = true;
			$results[]   = array(
				'path'   => $path,
				'exists' => false,
				'error'  => "field '{$root_name}' is not a value field.",
			);
			continue;
		}
		$root_key = $root_field['key'];
		if ( ! array_key_exists( $root_key, $roots ) ) {
			$roots[ $root_key ] = array(
				'field' => $root_field,
				'value' => muster_acf_load_root_value( $root_field, $post_id ),
			);
		}
		$walk = muster_acf_walk( $root_field, $roots[ $root_key ]['value'], $segments, $mode );
		if ( isset( $walk['error'] ) ) {
			$path_errors = true;
			$results[]   = array(
				'path'   => $path,
				'exists' => isset( $walk['exists'] ) ? $walk['exists'] : false,
				'error'  => $walk['error'],
				'count'  => isset( $walk['count'] ) ? $walk['count'] : null,
			);
			continue;
		}
		$row = array(
			'path'   => $path,
			'exists' => true,
			'field'  => $walk['field'],
		);
		if ( $mode === 'get' ) {
			$row['value'] = $walk['value'];
			$results[]    = $row;
			continue;
		}
		$new_raw     = isset( $item['value'] ) ? $item['value'] : null;
		$leaf_field  = is_array( $walk['leaf_field'] ) ? $walk['leaf_field'] : $root_field;
		$leaf_is_row = ! empty( $walk['leaf_is_row'] );
		list( $coerced, $err ) = $leaf_is_row
			? muster_acf_coerce_row( $leaf_field, $new_raw, $warnings, $path )
			: muster_acf_coerce( $leaf_field, $new_raw, $warnings, $path );
		if ( $err ) {
			$path_errors = true;
			$row['error'] = $err;
			$row['old']   = $walk['value'];
			$row['new']   = $new_raw;
			$results[]    = $row;
			continue;
		}
		$row['old']     = $walk['value'];
		$row['new']     = $coerced;
		$row['changed'] = ! muster_acf_same(
			muster_acf_normalise_at( $leaf_field, $leaf_is_row, $walk['value'] ),
			muster_acf_normalise_at( $leaf_field, $leaf_is_row, $coerced )
		);
		$row['applied'] = false;
		$row['warnings'] = array();
		$row['trace']    = $walk['trace'];
		$row['root_key'] = $root_key;
		$row['leaf_field'] = $leaf_field;
		$row['leaf_is_row'] = $leaf_is_row;
		$results[]       = $row;
	}

	if ( $apply && $path_errors ) {
		foreach ( $results as &$row ) {
			if ( isset( $row['applied'] ) ) {
				$row['applied'] = false;
			}
			unset( $row['trace'], $row['root_key'], $row['leaf_field'], $row['leaf_is_row'] );
		}
		unset( $row );
		return muster_acf_envelope(
			true,
			array(
				'warnings'     => array_merge( $warnings, array( 'apply skipped because one or more paths failed to resolve.' ) ),
				'results'      => $results,
				'apply'        => false,
				'apply_skipped' => true,
			)
		);
	}

	if ( $apply && ! $path_errors ) {
		$pending = array();
		foreach ( $results as $row ) {
			if ( ! isset( $row['root_key'] ) ) {
				continue;
			}
			$key = $row['root_key'];
			if ( ! array_key_exists( $key, $pending ) ) {
				$pending[ $key ] = $roots[ $key ]['value'];
			}
			$pending[ $key ] = muster_acf_set_by_trace( $pending[ $key ], $row['trace'], $row['new'] );
		}
		foreach ( $pending as $key => $value ) {
			// Return value is discarded: a sub-cell write leaves the root row count unchanged, which reads as false.
			muster_acf_write_root( $roots[ $key ]['field'], $value, $post_id );
		}
		$fresh_roots = array();
		$any_applied = false;
		foreach ( $results as &$row ) {
			if ( ! isset( $row['root_key'] ) ) {
				continue;
			}
			$key    = $row['root_key'];
			$wanted = $row['new'];
			$leaf   = $row['leaf_field'];
			$is_row = ! empty( $row['leaf_is_row'] );
			if ( ! array_key_exists( $key, $fresh_roots ) ) {
				$fresh_roots[ $key ] = muster_acf_load_root_value( $roots[ $key ]['field'], $post_id );
			}
			$got = muster_acf_get_by_trace( $fresh_roots[ $key ], $row['trace'] );
			if ( $got['ok'] ) {
				$row['new'] = $got['value'];
			}
			$row['applied'] = muster_acf_same(
				muster_acf_normalise_at( $leaf, $is_row, $got['ok'] ? $got['value'] : null ),
				muster_acf_normalise_at( $leaf, $is_row, $wanted )
			);
			if ( $row['applied'] ) {
				$any_applied = true;
			}
			unset( $row['trace'], $row['root_key'], $row['leaf_field'], $row['leaf_is_row'] );
		}
		unset( $row );
		if ( $any_applied ) {
			$warnings[] = 'Object caches and page-cache plugins may still serve stale HTML.';
		}
		return muster_acf_envelope(
			true,
			array(
				'warnings' => $warnings,
				'results'  => $results,
				'apply'    => $any_applied,
			)
		);
	}

	foreach ( $results as &$row ) {
		unset( $row['trace'], $row['root_key'], $row['leaf_field'], $row['leaf_is_row'] );
	}
	unset( $row );

	return muster_acf_envelope(
		true,
		array(
			'warnings' => $warnings,
			'results'  => $results,
			'apply'    => false,
		)
	);
}

function muster_acf_main() {
	error_reporting( E_ERROR );
	if ( function_exists( 'ini_set' ) ) {
		ini_set( 'display_errors', '0' );
	}
	$path = muster_acf_payload_path();
	if ( $path === '' ) {
		echo wp_json_encode( muster_acf_envelope( false, array( 'error' => 'payload path missing.' ) ) );
		return;
	}
	$raw = @file_get_contents( $path );
	if ( $raw === false ) {
		echo wp_json_encode( muster_acf_envelope( false, array( 'error' => "could not read payload file." ) ) );
		return;
	}
	$payload = json_decode( $raw, true );
	if ( ! is_array( $payload ) ) {
		echo wp_json_encode( muster_acf_envelope( false, array( 'error' => 'payload is not JSON.' ) ) );
		return;
	}
	if ( ! function_exists( 'wp_json_encode' ) ) {
		$encode = function ( $value ) {
			return json_encode( $value );
		};
	} else {
		$encode = 'wp_json_encode';
	}
	try {
		echo $encode( muster_acf_run( $payload ) );
	} catch ( Throwable $e ) {
		echo $encode( muster_acf_envelope( false, array( 'error' => $e->getMessage() ) ) );
	}
}

$GLOBALS['muster_acf_cli_args'] = array();
if ( isset( $args ) && is_array( $args ) ) {
	$GLOBALS['muster_acf_cli_args'] = $args;
} elseif ( isset( $argv ) && is_array( $argv ) ) {
	$GLOBALS['muster_acf_cli_args'] = array_slice( $argv, 1 );
}

if ( ! defined( 'MUSTER_ACF_NO_MAIN' ) ) {
	muster_acf_main();
}
