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
		if ( $part === '*' ) {
			if ( $i === 0 ) {
				return array( 'error' => 'path cannot start with a wildcard.' );
			}
			$segments[] = array(
				'kind' => 'wildcard',
				'name' => '*',
			);
			continue;
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

function muster_acf_group_has_param( $group, $param ) {
	$location = is_array( $group ) && isset( $group['location'] ) && is_array( $group['location'] ) ? $group['location'] : array();
	foreach ( $location as $rule_group ) {
		if ( ! is_array( $rule_group ) ) {
			continue;
		}
		foreach ( $rule_group as $rule ) {
			if ( is_array( $rule ) && isset( $rule['param'] ) && $rule['param'] === $param ) {
				return true;
			}
		}
	}
	return false;
}

function muster_acf_field_is_block( $field ) {
	return muster_acf_group_has_param( muster_acf_owning_group( $field ), 'block' );
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

/**
 * Storage shape for a human: container rows come back keyed by sub-field NAME,
 * not the composite clone keys ACF stores. Scalars pass through untouched.
 */
function muster_acf_present( $field, $value ) {
	$type = is_array( $field ) && isset( $field['type'] ) ? $field['type'] : '';
	if ( $type === 'repeater' || $type === 'flexible_content' ) {
		if ( ! is_array( $value ) ) {
			return $value;
		}
		$rows = array();
		foreach ( $value as $row ) {
			$rows[] = muster_acf_present_row( $field, $row );
		}
		return $rows;
	}
	if ( $type === 'group' || $type === 'clone' ) {
		return is_array( $value ) ? muster_acf_present_row( $field, $value ) : $value;
	}
	return $value;
}

/** A path ending in a row index addresses one row of $field, not the field's whole value. */
function muster_acf_present_at( $field, $is_row, $value ) {
	return $is_row ? muster_acf_present_row( $field, $value ) : muster_acf_present( $field, $value );
}

function muster_acf_present_row( $parent, $row ) {
	if ( ! is_array( $row ) ) {
		return $row;
	}
	$layout = isset( $row['acf_fc_layout'] ) && is_string( $row['acf_fc_layout'] ) ? $row['acf_fc_layout'] : null;
	$out    = array();
	if ( $layout !== null ) {
		$out['acf_fc_layout'] = $layout;
	}
	foreach ( muster_acf_layout_subfields( $parent, $layout ) as $sub ) {
		$name = isset( $sub['name'] ) ? $sub['name'] : '';
		if ( $name === '' || ! muster_acf_is_value_type( isset( $sub['type'] ) ? $sub['type'] : '' ) ) {
			continue;
		}
		if ( array_key_exists( $name, $out ) ) {
			continue;
		}
		$slot = muster_acf_value_slot( $row, $sub );
		if ( ! $slot['found'] ) {
			continue;
		}
		$out[ $name ] = muster_acf_present( $sub, $slot['value'] );
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

/** Tabs, accordions and messages have no name and store nothing; they are noise in an "Available" list. */
function muster_acf_subfield_names( $parent, $layout_name = null ) {
	$names = array();
	foreach ( muster_acf_layout_subfields( $parent, $layout_name ) as $sub ) {
		$name = isset( $sub['name'] ) ? $sub['name'] : '';
		if ( $name === '' || ! muster_acf_is_value_type( isset( $sub['type'] ) ? $sub['type'] : '' ) ) {
			continue;
		}
		if ( ! in_array( $name, $names, true ) ) {
			$names[] = $name;
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

/** Choices can be filter-populated at runtime, so an unknown value warns and still writes. */
function muster_acf_warn_unknown_choices( $field, $value, &$warnings, $path ) {
	$choices = is_array( $field ) && isset( $field['choices'] ) && is_array( $field['choices'] ) ? $field['choices'] : array();
	if ( count( $choices ) === 0 ) {
		return;
	}
	$valid = array();
	foreach ( array_keys( $choices ) as $choice ) {
		$valid[] = (string) $choice;
	}
	$items = is_array( $value ) ? $value : array( $value );
	foreach ( $items as $item ) {
		if ( $item === null || $item === '' || is_array( $item ) || is_object( $item ) ) {
			continue;
		}
		$needle = is_bool( $item ) ? ( $item ? '1' : '0' ) : (string) $item;
		if ( in_array( $needle, $valid, true ) ) {
			continue;
		}
		$shown = array_slice( $valid, 0, 10 );
		$extra = count( $valid ) - count( $shown );
		$warnings[] = "{$path}: '{$needle}' is not a registered choice. Valid: " . implode( ', ', $shown )
			. ( $extra > 0 ? " (+{$extra} more)" : '' );
	}
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
			muster_acf_warn_unknown_choices( $field, $value, $warnings, $path );
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
	$parent_layout = null;
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
			// The container keeps its own parent_layout; this row's layout is a separate key.
			$field_info['layout'] = $layout;
			$parent_layout        = $layout;
			continue;
		}
		if ( $seg['name'] === 'acf_fc_layout' && $leaf_is_row && isset( $cursor_field['type'] ) && $cursor_field['type'] === 'flexible_content' ) {
			if ( $i !== $count - 1 ) {
				return array( 'error' => 'acf_fc_layout has no sub-fields.' );
			}
			if ( $mode !== 'get' ) {
				return array( 'error' => 'acf_fc_layout is read-only; rewrite the row or use a row operation' );
			}
			$pseudo  = array(
				'name' => 'acf_fc_layout',
				'key'  => '',
				'type' => 'layout',
			);
			$trace[] = 'acf_fc_layout';
			return array(
				'field'       => array_merge( $pseudo, array( 'parent_layout' => $layout ) ),
				'leaf_field'  => $pseudo,
				'leaf_is_row' => false,
				'value'       => $layout,
				'trace'       => $trace,
				'exists'      => true,
			);
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
			'parent_layout' => $parent_layout,
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

/** Comparisons need storage shape, so a row is presented and stripped of internals only on the way out. */
function muster_acf_finalise_row( $row ) {
	$leaf   = isset( $row['leaf_field'] ) && is_array( $row['leaf_field'] ) ? $row['leaf_field'] : null;
	$is_row = ! empty( $row['leaf_is_row'] );
	$skip   = isset( $row['present_new'] ) && $row['present_new'] === false;
	if ( $leaf !== null ) {
		foreach ( array( 'value', 'old', 'new' ) as $slot ) {
			if ( ! array_key_exists( $slot, $row ) || ( $slot === 'new' && $skip ) ) {
				continue;
			}
			$row[ $slot ] = muster_acf_present_at( $leaf, $is_row, $row[ $slot ] );
		}
	}
	unset( $row['trace'], $row['root_key'], $row['leaf_field'], $row['leaf_is_row'], $row['present_new'] );
	return $row;
}

/** Undo payload: the presented `old` of every row that moved, shaped as update_wp_fields input. */
function muster_acf_revert_fields( $results, $flag ) {
	$fields = array();
	foreach ( $results as $row ) {
		if ( isset( $row['error'] ) || empty( $row[ $flag ] ) || ! array_key_exists( 'old', $row ) ) {
			continue;
		}
		$fields[] = array(
			'path'  => $row['path'],
			'value' => $row['old'],
		);
	}
	return $fields;
}

/**
 * Field groups whose location rules put them on this target.
 * ACF matches an options page by its menu slug, never by the ACF post_id, so those are resolved first.
 */
function muster_acf_describe_groups( $target, $post_id ) {
	if ( ! function_exists( 'acf_get_field_groups' ) ) {
		return array();
	}
	$kind = is_array( $target ) && isset( $target['kind'] ) ? $target['kind'] : 'option';
	$id   = is_array( $target ) && isset( $target['id'] ) ? $target['id'] : null;
	if ( $kind === 'post' ) {
		return muster_acf_usable_groups( acf_get_field_groups( array( 'post_id' => (int) $post_id ) ) );
	}
	if ( $kind === 'term' ) {
		$taxonomy = '';
		if ( function_exists( 'get_term' ) ) {
			$term = get_term( (int) $id );
			if ( is_object( $term ) && isset( $term->taxonomy ) ) {
				$taxonomy = $term->taxonomy;
			} elseif ( is_array( $term ) && isset( $term['taxonomy'] ) ) {
				$taxonomy = $term['taxonomy'];
			}
		}
		return $taxonomy === '' ? array() : muster_acf_usable_groups( acf_get_field_groups( array( 'taxonomy' => $taxonomy ) ) );
	}
	if ( $kind === 'user' ) {
		return muster_acf_usable_groups(
			acf_get_field_groups(
				array(
					'user_id'   => (int) $id,
					'user_form' => 'edit',
				)
			)
		);
	}
	if ( $kind === 'comment' ) {
		$post_type = '';
		if ( function_exists( 'get_comment' ) && function_exists( 'get_post_type' ) ) {
			$comment = get_comment( (int) $id );
			if ( is_object( $comment ) && isset( $comment->comment_post_ID ) ) {
				$post_type = (string) get_post_type( $comment->comment_post_ID );
			}
		}
		return $post_type === '' ? array() : muster_acf_usable_groups( acf_get_field_groups( array( 'comment' => $post_type ) ) );
	}
	return muster_acf_usable_groups( muster_acf_option_groups( $post_id ) );
}

/** Block groups live in post_content and are refused on write, so describe leaves them out too. */
function muster_acf_usable_groups( $groups ) {
	$out  = array();
	$seen = array();
	foreach ( is_array( $groups ) ? $groups : array() as $group ) {
		if ( ! is_array( $group ) || muster_acf_group_has_param( $group, 'block' ) ) {
			continue;
		}
		$key = isset( $group['key'] ) ? (string) $group['key'] : '';
		if ( $key !== '' && isset( $seen[ $key ] ) ) {
			continue;
		}
		$seen[ $key ] = true;
		$out[]        = $group;
	}
	return $out;
}

function muster_acf_option_groups( $post_id ) {
	$wanted = in_array( (string) $post_id, array( 'option', 'options' ), true ) ? '' : (string) $post_id;
	$slugs  = array();
	if ( function_exists( 'acf_get_options_pages' ) ) {
		$pages = acf_get_options_pages();
		foreach ( is_array( $pages ) ? $pages : array() as $page ) {
			if ( ! is_array( $page ) || empty( $page['menu_slug'] ) ) {
				continue;
			}
			$page_id = isset( $page['post_id'] ) && $page['post_id'] !== '' ? (string) $page['post_id'] : 'options';
			$default = in_array( $page_id, array( 'option', 'options' ), true );
			if ( $wanted === '' ? ! $default : $page_id !== $wanted ) {
				continue;
			}
			$slugs[] = (string) $page['menu_slug'];
		}
	}
	$groups = array();
	foreach ( $slugs as $slug ) {
		foreach ( acf_get_field_groups( array( 'options_page' => $slug ) ) as $group ) {
			$groups[] = $group;
		}
	}
	if ( count( $slugs ) > 0 ) {
		return $groups;
	}
	// No options page resolves this post_id; fall back to every group that targets one at all.
	$all = acf_get_field_groups();
	$out = array();
	foreach ( is_array( $all ) ? $all : array() as $group ) {
		if ( muster_acf_group_has_param( $group, 'options_page' ) ) {
			$out[] = $group;
		}
	}
	return $out;
}

function muster_acf_describe_subfields( $subs ) {
	$out  = array();
	$seen = array();
	foreach ( $subs as $sub ) {
		$name = isset( $sub['name'] ) ? $sub['name'] : '';
		$type = isset( $sub['type'] ) ? $sub['type'] : '';
		if ( $name === '' || ! muster_acf_is_value_type( $type ) || isset( $seen[ $name ] ) ) {
			continue;
		}
		$seen[ $name ] = true;
		$entry         = array(
			'name'  => $name,
			'type'  => $type,
			'label' => isset( $sub['label'] ) ? $sub['label'] : '',
		);
		$choices = isset( $sub['choices'] ) && is_array( $sub['choices'] ) ? $sub['choices'] : array();
		if ( count( $choices ) > 50 ) {
			$entry['choices_count'] = count( $choices );
		} elseif ( count( $choices ) > 0 ) {
			$entry['choices'] = $choices;
		}
		if ( ! empty( $sub['required'] ) ) {
			$entry['required'] = true;
		}
		$out[] = $entry;
	}
	return $out;
}

function muster_acf_field_layouts( $field ) {
	$layouts = isset( $field['layouts'] ) && is_array( $field['layouts'] ) ? $field['layouts'] : array();
	$out     = array();
	foreach ( $layouts as $layout ) {
		if ( ! is_array( $layout ) || empty( $layout['name'] ) ) {
			continue;
		}
		$out[] = $layout;
	}
	return $out;
}

/** One describe entry. $value is the unformatted value at $path; $is_row marks a path ending on a row. */
function muster_acf_describe_field( $field, $value, $path, $is_row, $layout_filter ) {
	$type  = isset( $field['type'] ) ? $field['type'] : '';
	$entry = array(
		'path'  => $path,
		'field' => array(
			'name'  => isset( $field['name'] ) ? $field['name'] : '',
			'key'   => isset( $field['key'] ) ? $field['key'] : '',
			'type'  => $type,
			'label' => isset( $field['label'] ) ? $field['label'] : '',
		),
	);
	if ( $is_row ) {
		$row    = is_array( $value ) ? $value : array();
		$layout = isset( $row['acf_fc_layout'] ) && is_string( $row['acf_fc_layout'] ) ? $row['acf_fc_layout'] : null;
		$entry['layout']     = $layout;
		$entry['sub_fields'] = muster_acf_describe_subfields( muster_acf_layout_subfields( $field, $layout ) );
		return $entry;
	}
	if ( $type === 'flexible_content' ) {
		$rows                 = is_array( $value ) ? $value : array();
		$entry['rows']        = count( $rows );
		$entry['layouts']     = array();
		$entry['row_layouts'] = array();
		foreach ( muster_acf_field_layouts( $field ) as $layout ) {
			$entry['layouts'][] = array(
				'name'       => $layout['name'],
				'label'      => isset( $layout['label'] ) ? $layout['label'] : '',
				'sub_fields' => muster_acf_describe_subfields( muster_acf_layout_subfields( $field, $layout['name'] ) ),
			);
		}
		$indexes = array();
		foreach ( $rows as $index => $row ) {
			$name = is_array( $row ) && isset( $row['acf_fc_layout'] ) ? $row['acf_fc_layout'] : null;
			$entry['row_layouts'][] = array(
				'index'  => $index,
				'layout' => $name,
			);
			if ( is_string( $layout_filter ) && $layout_filter !== '' && $name === $layout_filter ) {
				$indexes[] = $index;
			}
		}
		if ( is_string( $layout_filter ) && $layout_filter !== '' ) {
			$entry['where'] = array(
				'layout'  => $layout_filter,
				'indexes' => $indexes,
			);
		}
		return $entry;
	}
	if ( $type === 'repeater' ) {
		$entry['rows']       = is_array( $value ) ? count( $value ) : 0;
		$entry['sub_fields'] = muster_acf_describe_subfields( muster_acf_layout_subfields( $field ) );
		return $entry;
	}
	if ( $type === 'group' || $type === 'clone' ) {
		$entry['sub_fields'] = muster_acf_describe_subfields( muster_acf_layout_subfields( $field ) );
	}
	return $entry;
}

/** 256 KB ceiling: shed the bulkiest detail first, and say so rather than returning a clipped JSON string. */
function muster_acf_describe_truncate( $results, $warnings ) {
	$limit  = 262144;
	$levels = array( 'choices', 'layout_sub_fields', 'sub_fields', 'row_layouts' );
	$note   = array(
		'choices'           => 'describe truncated: choice lists dropped.',
		'layout_sub_fields' => 'describe truncated: layout sub-fields dropped.',
		'sub_fields'        => 'describe truncated: sub-field and layout detail dropped.',
		'row_layouts'       => 'describe truncated: row layouts dropped.',
	);
	$truncated = false;
	foreach ( $levels as $level ) {
		$encoded = json_encode( array( $results, $warnings ) );
		if ( $encoded === false || strlen( $encoded ) <= $limit ) {
			return array( $results, $warnings, $truncated );
		}
		$truncated  = true;
		$warnings[] = $note[ $level ];
		foreach ( $results as $i => $entry ) {
			if ( $level === 'choices' ) {
				$results[ $i ] = muster_acf_strip_choices( $entry );
				continue;
			}
			if ( $level === 'layout_sub_fields' && isset( $entry['layouts'] ) ) {
				foreach ( $entry['layouts'] as $j => $layout ) {
					unset( $layout['sub_fields'] );
					$entry['layouts'][ $j ] = $layout;
				}
				$results[ $i ] = $entry;
				continue;
			}
			if ( $level === 'sub_fields' ) {
				unset( $entry['layouts'], $entry['sub_fields'] );
				$results[ $i ] = $entry;
				continue;
			}
			unset( $entry['row_layouts'] );
			$results[ $i ] = $entry;
		}
	}
	return array( $results, $warnings, $truncated );
}

function muster_acf_strip_choices( $entry ) {
	if ( isset( $entry['sub_fields'] ) ) {
		$entry['sub_fields'] = muster_acf_strip_choice_list( $entry['sub_fields'] );
	}
	if ( isset( $entry['layouts'] ) ) {
		foreach ( $entry['layouts'] as $i => $layout ) {
			if ( isset( $layout['sub_fields'] ) ) {
				$layout['sub_fields'] = muster_acf_strip_choice_list( $layout['sub_fields'] );
			}
			$entry['layouts'][ $i ] = $layout;
		}
	}
	return $entry;
}

function muster_acf_strip_choice_list( $subs ) {
	foreach ( $subs as $i => $sub ) {
		if ( ! isset( $sub['choices'] ) ) {
			continue;
		}
		$sub['choices_count'] = count( $sub['choices'] );
		unset( $sub['choices'] );
		$subs[ $i ] = $sub;
	}
	return $subs;
}

function muster_acf_has_wildcard( $segments ) {
	foreach ( $segments as $seg ) {
		if ( $seg['kind'] === 'wildcard' ) {
			return true;
		}
	}
	return false;
}

function muster_acf_path_string( $segments ) {
	$parts = array();
	foreach ( $segments as $seg ) {
		$parts[] = $seg['kind'] === 'index' ? (string) $seg['index'] : $seg['name'];
	}
	return implode( '.', $parts );
}

/**
 * Turns one starred pattern into the concrete paths it addresses.
 * Row counts come from the stored value, so a star only ever expands to rows that exist.
 */
function muster_acf_expand_wildcards( $root_field, $root_value, $segments, $index_path, &$skipped ) {
	$pos = -1;
	foreach ( $segments as $i => $seg ) {
		if ( $seg['kind'] === 'wildcard' ) {
			$pos = $i;
			break;
		}
	}
	if ( $pos < 0 ) {
		return array(
			'paths' => array(
				array(
					'segments'   => $segments,
					'index_path' => $index_path,
				),
			),
		);
	}
	$prefix = array_slice( $segments, 0, $pos );
	$walk   = muster_acf_walk( $root_field, $root_value, $prefix, 'get' );
	$fail   = null;
	if ( isset( $walk['error'] ) ) {
		$fail = $walk['error'];
	} elseif ( ! empty( $walk['leaf_is_row'] ) || ! in_array( isset( $walk['leaf_field']['type'] ) ? $walk['leaf_field']['type'] : '', array( 'repeater', 'flexible_content' ), true ) ) {
		$fail = "'*' is only valid where a row index is valid.";
	}
	if ( $fail !== null ) {
		// Already inside an expanded row: this branch is a skip, the way a missing sub-field is.
		if ( count( $index_path ) === 0 ) {
			return array( 'error' => $fail );
		}
		$skipped[] = array(
			'index_path' => $index_path,
			'layout'     => muster_acf_wildcard_row_layout( $root_field, $root_value, $prefix ),
		);
		return array( 'paths' => array() );
	}
	$rows = is_array( $walk['value'] ) ? $walk['value'] : array();
	$out  = array();
	foreach ( array_keys( $rows ) as $index ) {
		if ( ! is_int( $index ) ) {
			continue;
		}
		$concrete         = $segments;
		$concrete[ $pos ] = array(
			'kind'  => 'index',
			'index' => $index,
			'name'  => (string) $index,
		);
		$deeper = muster_acf_expand_wildcards( $root_field, $root_value, $concrete, array_merge( $index_path, array( $index ) ), $skipped );
		if ( isset( $deeper['error'] ) ) {
			return $deeper;
		}
		foreach ( $deeper['paths'] as $item ) {
			$out[] = $item;
		}
	}
	return array( 'paths' => $out );
}

/** The layout of the deepest row a pattern did reach; how a skipped match says why it was skipped. */
function muster_acf_wildcard_row_layout( $root_field, $root_value, $segments ) {
	for ( $i = count( $segments ) - 1; $i >= 0; $i-- ) {
		if ( $segments[ $i ]['kind'] !== 'index' ) {
			continue;
		}
		$walk = muster_acf_walk( $root_field, $root_value, array_slice( $segments, 0, $i + 1 ), 'get' );
		if ( isset( $walk['error'] ) ) {
			continue;
		}
		return isset( $walk['field']['layout'] ) ? $walk['field']['layout'] : null;
	}
	return null;
}

function muster_acf_wildcard_result( $root_field, $root_value, $path, $segments ) {
	$skipped  = array();
	$expanded = muster_acf_expand_wildcards( $root_field, $root_value, $segments, array(), $skipped );
	if ( isset( $expanded['error'] ) ) {
		return array(
			'path'   => $path,
			'exists' => false,
			'error'  => $expanded['error'],
		);
	}
	$matches   = array();
	$truncated = false;
	foreach ( $expanded['paths'] as $item ) {
		if ( count( $matches ) >= 2000 ) {
			$truncated = true;
			break;
		}
		$walk = muster_acf_walk( $root_field, $root_value, $item['segments'], 'get' );
		if ( isset( $walk['error'] ) ) {
			$skipped[] = array(
				'index_path' => $item['index_path'],
				'layout'     => muster_acf_wildcard_row_layout( $root_field, $root_value, $item['segments'] ),
			);
			continue;
		}
		$leaf      = is_array( $walk['leaf_field'] ) ? $walk['leaf_field'] : $root_field;
		$matches[] = array(
			'index_path' => $item['index_path'],
			'path'       => muster_acf_path_string( $item['segments'] ),
			'value'      => muster_acf_present_at( $leaf, ! empty( $walk['leaf_is_row'] ), $walk['value'] ),
			'field'      => $walk['field'],
		);
	}
	$row = array(
		'path'     => $path,
		'exists'   => true,
		'wildcard' => true,
		'count'    => count( $matches ),
		'matches'  => $matches,
		'skipped'  => $skipped,
	);
	if ( $truncated ) {
		$row['truncated'] = true;
	}
	return $row;
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

function muster_acf_int_or_null( $value ) {
	if ( is_int( $value ) ) {
		return $value;
	}
	if ( is_float( $value ) && (int) $value == $value ) {
		return (int) $value;
	}
	if ( is_string( $value ) && preg_match( '/^[0-9]+$/', $value ) ) {
		return (int) $value;
	}
	return null;
}

function muster_acf_row_layouts( $container, $rows ) {
	$is_flex = isset( $container['type'] ) && $container['type'] === 'flexible_content';
	$out     = array();
	foreach ( array_values( is_array( $rows ) ? $rows : array() ) as $index => $row ) {
		$out[] = array(
			'index'  => $index,
			'layout' => $is_flex && is_array( $row ) && isset( $row['acf_fc_layout'] ) ? $row['acf_fc_layout'] : null,
		);
	}
	return $out;
}

function muster_acf_layout_names( $container ) {
	$names = array();
	foreach ( muster_acf_field_layouts( $container ) as $layout ) {
		$names[] = $layout['name'];
	}
	return $names;
}

/** Builds one unformatted row: name-keyed input, key-keyed storage, unnamed sub-fields left unset. */
function muster_acf_build_row( $container, $layout, $values, &$warnings, $label ) {
	$row = array();
	if ( isset( $container['type'] ) && $container['type'] === 'flexible_content' ) {
		$row['acf_fc_layout'] = $layout;
	}
	if ( $values === null ) {
		return array( $row, null );
	}
	if ( ! is_array( $values ) ) {
		return array( null, "{$label}: values must be an object keyed by sub-field name." );
	}
	foreach ( $values as $name => $value ) {
		if ( ! is_string( $name ) ) {
			return array( null, "{$label}: values must be an object keyed by sub-field name." );
		}
		$sub = muster_acf_find_subfield( $container, $name, $layout );
		if ( ! $sub ) {
			$available = implode( ', ', muster_acf_subfield_names( $container, $layout ) );
			return array( null, "{$label}: unknown sub-field '{$name}'. Available: {$available}" );
		}
		list( $coerced, $err ) = muster_acf_coerce( $sub, $value, $warnings, "{$label}.{$name}" );
		if ( $err ) {
			return array( null, $err );
		}
		$slot         = ! empty( $sub['key'] ) ? $sub['key'] : $name;
		$row[ $slot ] = $coerced;
	}
	return array( $row, null );
}

/** Runs one op against the rows as they stand, returning the new array and the op that undoes it. */
function muster_acf_row_op( $container, $rows, $item, &$warnings, $path ) {
	$op      = isset( $item['op'] ) && is_string( $item['op'] ) ? $item['op'] : '';
	$is_flex = isset( $container['type'] ) && $container['type'] === 'flexible_content';
	$count   = count( $rows );
	$label   = "{$path} {$op}";
	$layout  = isset( $item['layout'] ) && is_string( $item['layout'] ) ? $item['layout'] : null;
	$index   = array_key_exists( 'index', $item ) ? muster_acf_int_or_null( $item['index'] ) : null;
	$to      = array_key_exists( 'to', $item ) ? muster_acf_int_or_null( $item['to'] ) : null;

	if ( ! in_array( $op, array( 'append', 'insert', 'delete', 'move', 'duplicate' ), true ) ) {
		return array( 'error' => "'{$op}' is not a row operation. Valid: append, insert, delete, move, duplicate." );
	}
	if ( in_array( $op, array( 'append', 'insert' ), true ) ) {
		if ( $is_flex ) {
			$names = muster_acf_layout_names( $container );
			if ( $layout === null || $layout === '' ) {
				return array( 'error' => "{$label}: layout is required on a flexible field. Layouts: " . implode( ', ', $names ) );
			}
			if ( ! in_array( $layout, $names, true ) ) {
				return array( 'error' => "{$label}: unknown layout '{$layout}'. Layouts: " . implode( ', ', $names ) );
			}
		} elseif ( $layout !== null ) {
			return array( 'error' => "{$label}: layout is not valid on a repeater." );
		}
	}
	if ( in_array( $op, array( 'delete', 'move', 'duplicate' ), true ) ) {
		if ( $index === null ) {
			return array( 'error' => "{$label}: index is required." );
		}
		if ( $index < 0 || $index >= $count ) {
			return array( 'error' => "{$label}: index {$index} out of range (count={$count})." );
		}
	}

	if ( $op === 'append' || $op === 'insert' ) {
		if ( $op === 'insert' ) {
			if ( $index === null ) {
				return array( 'error' => "{$label}: index is required." );
			}
			if ( $index < 0 || $index > $count ) {
				return array( 'error' => "{$label}: index {$index} out of range (count={$count})." );
			}
		} else {
			$index = $count;
		}
		list( $row, $err ) = muster_acf_build_row( $container, $layout, isset( $item['values'] ) ? $item['values'] : null, $warnings, $label );
		if ( $err ) {
			return array( 'error' => $err );
		}
		array_splice( $rows, $index, 0, array( $row ) );
		return array(
			'rows'   => $rows,
			'revert' => array(
				'op'    => 'delete',
				'path'  => $path,
				'index' => $index,
			),
		);
	}

	if ( $op === 'delete' ) {
		$removed   = $rows[ $index ];
		$presented = muster_acf_present_row( $container, $removed );
		$was       = is_array( $presented ) && isset( $presented['acf_fc_layout'] ) ? $presented['acf_fc_layout'] : null;
		if ( is_array( $presented ) ) {
			unset( $presented['acf_fc_layout'] );
		}
		array_splice( $rows, $index, 1 );
		$revert = array(
			'op'     => 'insert',
			'path'   => $path,
			'index'  => $index,
			'values' => $presented,
		);
		if ( $is_flex ) {
			$revert['layout'] = $was;
		}
		return array(
			'rows'   => $rows,
			'revert' => $revert,
		);
	}

	if ( $op === 'move' ) {
		if ( $to === null ) {
			return array( 'error' => "{$label}: to is required." );
		}
		if ( $to < 0 || $to >= $count ) {
			return array( 'error' => "{$label}: to {$to} out of range (count={$count})." );
		}
		$moved = $rows[ $index ];
		array_splice( $rows, $index, 1 );
		array_splice( $rows, $to, 0, array( $moved ) );
		return array(
			'rows'   => $rows,
			'revert' => array(
				'op'    => 'move',
				'path'  => $path,
				'index' => $to,
				'to'    => $index,
			),
		);
	}

	$to = $to === null ? $index + 1 : $to;
	if ( $to < 0 || $to > $count ) {
		return array( 'error' => "{$label}: to {$to} out of range (count={$count})." );
	}
	$copy = $rows[ $index ];
	array_splice( $rows, $to, 0, array( $copy ) );
	return array(
		'rows'   => $rows,
		'revert' => array(
			'op'    => 'delete',
			'path'  => $path,
			'index' => $to,
		),
	);
}

/**
 * Row ops run after every leaf write on the same root, each against the result of the one before it,
 * so an op's index always reads the array as it stands at that point.
 */
function muster_acf_run_row_ops( $items, $post_id, &$roots, &$pending, &$warnings, &$path_errors ) {
	$out = array();
	foreach ( $items as $item ) {
		$op   = is_array( $item ) && isset( $item['op'] ) && is_string( $item['op'] ) ? $item['op'] : '';
		$path = is_array( $item ) && isset( $item['path'] ) && is_string( $item['path'] ) ? $item['path'] : '';
		$fail = null;
		if ( ! is_array( $item ) ) {
			$fail = 'a row operation must be an object.';
		}
		$segments = array();
		if ( $fail === null ) {
			$parsed = muster_acf_parse_path( $path );
			if ( isset( $parsed['error'] ) ) {
				$fail = $parsed['error'];
			} else {
				$segments = $parsed['segments'];
				if ( muster_acf_has_wildcard( $segments ) ) {
					$fail = 'wildcards are read-only';
				}
			}
		}
		$root_field = null;
		if ( $fail === null ) {
			$root = muster_acf_resolve_root( $segments[0]['name'] );
			if ( isset( $root['error'] ) ) {
				$fail = $root['error'];
			} else {
				$root_field = $root['field'];
			}
		}
		if ( $fail !== null ) {
			$path_errors = true;
			$out[]       = array(
				'op'      => $op,
				'path'    => $path,
				'error'   => $fail,
				'applied' => false,
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
		if ( ! array_key_exists( $root_key, $pending ) ) {
			$pending[ $root_key ] = $roots[ $root_key ]['value'];
		}
		$walk = muster_acf_walk( $root_field, $pending[ $root_key ], $segments, 'get' );
		if ( isset( $walk['error'] ) ) {
			$path_errors = true;
			$out[]       = array(
				'op'      => $op,
				'path'    => $path,
				'error'   => $walk['error'],
				'applied' => false,
			);
			continue;
		}
		$container = is_array( $walk['leaf_field'] ) ? $walk['leaf_field'] : $root_field;
		$type      = isset( $container['type'] ) ? $container['type'] : '';
		if ( ! empty( $walk['leaf_is_row'] ) || ! in_array( $type, array( 'repeater', 'flexible_content' ), true ) ) {
			$path_errors = true;
			$out[]       = array(
				'op'      => $op,
				'path'    => $path,
				'error'   => empty( $walk['leaf_is_row'] )
					? "row operations need a repeater or flexible_content path; '{$path}' is a {$type}."
					: "row operations address the container, not a row; drop the row index from '{$path}'.",
				'applied' => false,
			);
			continue;
		}
		$before = is_array( $walk['value'] ) ? array_values( $walk['value'] ) : array();
		$result = muster_acf_row_op( $container, $before, $item, $warnings, $path );
		if ( isset( $result['error'] ) ) {
			$path_errors = true;
			$out[]       = array(
				'op'      => $op,
				'path'    => $path,
				'error'   => $result['error'],
				'applied' => false,
			);
			continue;
		}
		$pending[ $root_key ] = muster_acf_set_by_trace( $pending[ $root_key ], $walk['trace'], $result['rows'] );
		$out[]                = array(
			'op'           => $op,
			'path'         => $path,
			'before_count' => count( $before ),
			'after_count'  => count( $result['rows'] ),
			'row_layouts'  => muster_acf_row_layouts( $container, $result['rows'] ),
			'applied'      => false,
			'trace'        => $walk['trace'],
			'root_key'     => $root_key,
			'container'    => $container,
			'revert'       => $result['revert'],
		);
	}
	return $out;
}

function muster_acf_finalise_op( $op_row ) {
	unset( $op_row['trace'], $op_row['root_key'], $op_row['container'], $op_row['revert'] );
	return $op_row;
}

/**
 * Field paths in a revert were walked before the ops moved any indexes, so the two lists
 * replay as two calls, rows first. Say so whenever a caller has both to send.
 */
function muster_acf_revert_payload( $target, $fields, $rows, &$warnings ) {
	if ( count( $fields ) > 0 && count( $rows ) > 0 ) {
		$warnings[] = 'revert: send revert.rows first, then revert.fields; row operations move the indexes a field path uses.';
	}
	return array(
		'target' => $target,
		'fields' => $fields,
		'rows'   => $rows,
	);
}

/** Undo ops replay in list order, so they come back in the reverse of the order they were applied. */
function muster_acf_revert_rows( $op_results, $require_applied ) {
	$out = array();
	foreach ( $op_results as $op_row ) {
		if ( isset( $op_row['error'] ) || ! isset( $op_row['revert'] ) ) {
			continue;
		}
		if ( $require_applied && empty( $op_row['applied'] ) ) {
			continue;
		}
		$out[] = $op_row['revert'];
	}
	return array_reverse( $out );
}

/** The root-name guards, shared by every mode: unknown, block-located, a sub-field, or not a value field. */
function muster_acf_resolve_root( $root_name ) {
	$root_field = acf_get_field( $root_name );
	if ( ! $root_field ) {
		return array( 'error' => "field '{$root_name}' is not registered on this WordPress (home=" . ( muster_acf_home() ? muster_acf_home() : '?' ) . ').' );
	}
	if ( muster_acf_field_is_block( $root_field ) ) {
		return array( 'error' => "field '{$root_name}' is an ACF block field; Gutenberg blocks live in post_content and are not updated." );
	}
	// acf_get_field() resolves sub-field names too; addressing one as a root writes a stray top-level meta row.
	$owner = muster_acf_parent_field( isset( $root_field['parent'] ) ? $root_field['parent'] : 0 );
	if ( is_array( $owner ) ) {
		$owner_name = isset( $owner['name'] ) ? $owner['name'] : '';
		$owner_type = isset( $owner['type'] ) ? $owner['type'] : '';
		$dotted     = in_array( $owner_type, array( 'repeater', 'flexible_content' ), true )
			? "{$owner_name}.<row>.{$root_name}"
			: "{$owner_name}.{$root_name}";
		return array( 'error' => "'{$root_name}' is a sub-field of '{$owner_name}'; address it as {$dotted}" );
	}
	if ( ! muster_acf_is_value_type( isset( $root_field['type'] ) ? $root_field['type'] : '' ) ) {
		return array( 'error' => "field '{$root_name}' is not a value field." );
	}
	return array( 'field' => $root_field );
}

function muster_acf_describe_run( $payload, $target, $post_id ) {
	$layout_filter = isset( $payload['layout_filter'] ) && is_string( $payload['layout_filter'] ) ? $payload['layout_filter'] : null;
	$items         = isset( $payload['fields'] ) && is_array( $payload['fields'] ) ? $payload['fields'] : array();
	$results       = array();
	$warnings      = array();

	if ( count( $items ) === 0 ) {
		foreach ( muster_acf_describe_groups( $target, $post_id ) as $group ) {
			$fields = function_exists( 'acf_get_fields' ) ? acf_get_fields( $group ) : array();
			foreach ( is_array( $fields ) ? $fields : array() as $field ) {
				$name = is_array( $field ) && isset( $field['name'] ) ? $field['name'] : '';
				if ( $name === '' || ! muster_acf_is_value_type( isset( $field['type'] ) ? $field['type'] : '' ) ) {
					continue;
				}
				$results[] = muster_acf_describe_field(
					$field,
					muster_acf_load_root_value( $field, $post_id ),
					$name,
					false,
					$layout_filter
				);
			}
		}
		if ( count( $results ) === 0 ) {
			$warnings[] = 'no field groups match this target.';
		}
	}

	foreach ( $items as $item ) {
		$path   = is_array( $item ) && isset( $item['path'] ) ? $item['path'] : ( is_string( $item ) ? $item : '' );
		$parsed = muster_acf_parse_path( $path );
		if ( isset( $parsed['error'] ) ) {
			$results[] = array(
				'path'   => $path,
				'exists' => false,
				'error'  => $parsed['error'],
			);
			continue;
		}
		$segments = $parsed['segments'];
		if ( muster_acf_has_wildcard( $segments ) ) {
			$results[] = array(
				'path'   => $path,
				'exists' => false,
				'error'  => 'wildcards are not valid in describe.',
			);
			continue;
		}
		$root = muster_acf_resolve_root( $segments[0]['name'] );
		if ( isset( $root['error'] ) ) {
			$results[] = array(
				'path'   => $path,
				'exists' => false,
				'error'  => $root['error'],
			);
			continue;
		}
		$root_field = $root['field'];
		$walk       = muster_acf_walk( $root_field, muster_acf_load_root_value( $root_field, $post_id ), $segments, 'get' );
		if ( isset( $walk['error'] ) ) {
			$results[] = array(
				'path'   => $path,
				'exists' => isset( $walk['exists'] ) ? $walk['exists'] : false,
				'error'  => $walk['error'],
			);
			continue;
		}
		$results[] = muster_acf_describe_field(
			is_array( $walk['leaf_field'] ) ? $walk['leaf_field'] : $root_field,
			$walk['value'],
			$path,
			! empty( $walk['leaf_is_row'] ),
			$layout_filter
		);
	}

	list( $results, $warnings, $truncated ) = muster_acf_describe_truncate( $results, $warnings );
	return muster_acf_envelope(
		true,
		array(
			'warnings'  => $warnings,
			'results'   => $results,
			'apply'     => false,
			'describe'  => true,
			'truncated' => $truncated,
		)
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
	$post_id = $resolved['post_id'];
	if ( $mode === 'describe' ) {
		return muster_acf_describe_run( $payload, $target, $post_id );
	}
	$row_ops = isset( $payload['rows'] ) && is_array( $payload['rows'] ) ? $payload['rows'] : array();
	if ( count( $row_ops ) > 0 && $mode === 'get' ) {
		return muster_acf_envelope( false, array( 'error' => 'row operations need preview or apply.' ) );
	}
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
		if ( muster_acf_has_wildcard( $segments ) && $mode !== 'get' ) {
			$path_errors = true;
			$results[]   = array(
				'path'   => $path,
				'exists' => false,
				'error'  => 'wildcards are read-only',
			);
			continue;
		}
		$root_name     = $segments[0]['name'];
		$resolved_root = muster_acf_resolve_root( $root_name );
		if ( isset( $resolved_root['error'] ) ) {
			$path_errors = true;
			$results[]   = array(
				'path'   => $path,
				'exists' => false,
				'error'  => $resolved_root['error'],
			);
			continue;
		}
		$root_field = $resolved_root['field'];
		$root_key   = $root_field['key'];
		if ( ! array_key_exists( $root_key, $roots ) ) {
			$roots[ $root_key ] = array(
				'field' => $root_field,
				'value' => muster_acf_load_root_value( $root_field, $post_id ),
			);
		}
		if ( muster_acf_has_wildcard( $segments ) ) {
			$expanded = muster_acf_wildcard_result( $root_field, $roots[ $root_key ]['value'], $path, $segments );
			if ( isset( $expanded['error'] ) ) {
				$path_errors = true;
			}
			$results[] = $expanded;
			continue;
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
			$row['value']       = $walk['value'];
			$row['leaf_field']  = is_array( $walk['leaf_field'] ) ? $walk['leaf_field'] : $root_field;
			$row['leaf_is_row'] = ! empty( $walk['leaf_is_row'] );
			$results[]          = $row;
			continue;
		}
		$new_raw     = isset( $item['value'] ) ? $item['value'] : null;
		$leaf_field  = is_array( $walk['leaf_field'] ) ? $walk['leaf_field'] : $root_field;
		$leaf_is_row = ! empty( $walk['leaf_is_row'] );
		list( $coerced, $err ) = $leaf_is_row
			? muster_acf_coerce_row( $leaf_field, $new_raw, $warnings, $path )
			: muster_acf_coerce( $leaf_field, $new_raw, $warnings, $path );
		if ( $err ) {
			$path_errors        = true;
			$row['error']       = $err;
			$row['old']         = $walk['value'];
			$row['new']         = $new_raw;
			$row['leaf_field']  = $leaf_field;
			$row['leaf_is_row'] = $leaf_is_row;
			// The rejected value is echoed back as the agent sent it.
			$row['present_new'] = false;
			$results[]          = $row;
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

	// Leaf writes land first, against the value their traces were walked on; row ops then reshape the result.
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
	$row_results = count( $row_ops ) > 0
		? muster_acf_run_row_ops( $row_ops, $post_id, $roots, $pending, $warnings, $path_errors )
		: array();

	if ( $apply && $path_errors ) {
		foreach ( $results as $i => $row ) {
			if ( isset( $row['applied'] ) ) {
				$row['applied'] = false;
			}
			$results[ $i ] = muster_acf_finalise_row( $row );
		}
		foreach ( $row_results as $i => $op_row ) {
			$op_row['applied']  = false;
			$row_results[ $i ] = muster_acf_finalise_op( $op_row );
		}
		// Nothing was written, so ok reports the outcome the caller asked for, not the walk.
		return muster_acf_envelope(
			false,
			array(
				'warnings'     => array_merge( $warnings, array( 'apply skipped because one or more paths failed to resolve.' ) ),
				'results'      => $results,
				'rows'         => $row_results,
				'apply'        => false,
				'apply_skipped' => true,
				'revert'       => array(
					'target' => $target,
					'fields' => array(),
					'rows'   => array(),
				),
			)
		);
	}

	if ( $apply && ! $path_errors ) {
		foreach ( $pending as $key => $value ) {
			// Return value is discarded: a sub-cell write leaves the root row count unchanged, which reads as false.
			muster_acf_write_root( $roots[ $key ]['field'], $value, $post_id );
		}
		$fresh_roots = array();
		$any_applied = false;
		foreach ( $results as $i => $row ) {
			if ( ! isset( $row['root_key'] ) ) {
				$results[ $i ] = muster_acf_finalise_row( $row );
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
			$results[ $i ] = muster_acf_finalise_row( $row );
		}
		// after_count and row_layouts come from the re-read, so several ops on one root all report its final state.
		foreach ( $row_results as $i => $op_row ) {
			if ( ! isset( $op_row['root_key'] ) ) {
				continue;
			}
			$key = $op_row['root_key'];
			if ( ! array_key_exists( $key, $fresh_roots ) ) {
				$fresh_roots[ $key ] = muster_acf_load_root_value( $roots[ $key ]['field'], $post_id );
			}
			$got    = muster_acf_get_by_trace( $fresh_roots[ $key ], $op_row['trace'] );
			$want   = muster_acf_get_by_trace( $pending[ $key ], $op_row['trace'] );
			$stored = $got['ok'] && is_array( $got['value'] ) ? array_values( $got['value'] ) : array();
			$op_row['after_count'] = count( $stored );
			$op_row['row_layouts'] = muster_acf_row_layouts( $op_row['container'], $stored );
			$op_row['applied']     = $got['ok'] && muster_acf_same(
				muster_acf_normalise( $op_row['container'], $want['ok'] ? $want['value'] : null ),
				muster_acf_normalise( $op_row['container'], $stored )
			);
			if ( $op_row['applied'] ) {
				$any_applied = true;
			}
			$row_results[ $i ] = $op_row;
		}
		$revert = muster_acf_revert_payload(
			$target,
			muster_acf_revert_fields( $results, 'applied' ),
			muster_acf_revert_rows( $row_results, true ),
			$warnings
		);
		foreach ( $row_results as $i => $op_row ) {
			$row_results[ $i ] = muster_acf_finalise_op( $op_row );
		}
		if ( $any_applied ) {
			$warnings[] = 'Object caches and page-cache plugins may still serve stale HTML.';
		}
		return muster_acf_envelope(
			true,
			array(
				'warnings' => $warnings,
				'results'  => $results,
				'rows'     => $row_results,
				'apply'    => $any_applied,
				'revert'   => $revert,
			)
		);
	}

	foreach ( $results as $i => $row ) {
		$results[ $i ] = muster_acf_finalise_row( $row );
	}

	$extra = array(
		'warnings' => $warnings,
		'results'  => $results,
		'apply'    => false,
	);
	if ( $mode !== 'get' ) {
		$extra['revert'] = muster_acf_revert_payload(
			$target,
			muster_acf_revert_fields( $results, 'changed' ),
			muster_acf_revert_rows( $row_results, false ),
			$warnings
		);
		foreach ( $row_results as $i => $op_row ) {
			$row_results[ $i ] = muster_acf_finalise_op( $op_row );
		}
		$extra['rows']     = $row_results;
		$extra['warnings'] = $warnings;
	}
	return muster_acf_envelope( true, $extra );
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
