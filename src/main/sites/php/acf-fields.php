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

function muster_acf_field_is_block( $field ) {
	$location = isset( $field['location'] ) && is_array( $field['location'] ) ? $field['location'] : array();
	foreach ( $location as $group ) {
		if ( ! is_array( $group ) ) {
			continue;
		}
		foreach ( $group as $rule ) {
			if ( is_array( $rule ) && isset( $rule['param'] ) && $rule['param'] === 'block' ) {
				return true;
			}
		}
	}
	return false;
}

function muster_acf_find_subfield( $parent, $name, $layout_name = null ) {
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
	foreach ( $subs as $sub ) {
		if ( ! is_array( $sub ) ) {
			continue;
		}
		if ( ( isset( $sub['name'] ) && $sub['name'] === $name ) || ( isset( $sub['key'] ) && $sub['key'] === $name ) ) {
			return $sub;
		}
	}
	return null;
}

function muster_acf_subfield_names( $parent, $layout_name = null ) {
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
	$names = array();
	foreach ( $subs as $sub ) {
		if ( is_array( $sub ) && isset( $sub['name'] ) ) {
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

function muster_acf_coerce( $field, $value, &$warnings, $path ) {
	$type = isset( $field['type'] ) ? $field['type'] : '';
	if ( ! muster_acf_is_value_type( $type ) ) {
		return array( null, "{$path}: '{$type}' is not a value field." );
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
		$key          = isset( $sub['name'] ) ? $sub['name'] : $seg['name'];
		$trace[]      = $key;
		if ( is_array( $cursor_value ) && array_key_exists( $key, $cursor_value ) ) {
			$cursor_value = $cursor_value[ $key ];
		} else {
			$cursor_value = null;
		}
		$layout = null;
		$field_info = array(
			'name'          => $key,
			'key'           => isset( $sub['key'] ) ? $sub['key'] : '',
			'type'          => isset( $sub['type'] ) ? $sub['type'] : '',
			'parent_layout' => $field_info['parent_layout'],
		);
	}
	return array(
		'field' => $field_info,
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
			$value = function_exists( 'get_field' ) ? get_field( $root_key, $post_id, false ) : null;
			if ( $value === false ) {
				$value = null;
			}
			$roots[ $root_key ] = array(
				'field' => $root_field,
				'value' => $value,
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
		$new_raw = isset( $item['value'] ) ? $item['value'] : null;
		$leaf    = $walk['field'];
		// Coerce against the leaf field definition; fall back to the root when the path is the root.
		$leaf_field = $root_field;
		if ( count( $walk['trace'] ) > 0 ) {
			// Re-resolve the leaf field from the walk info key.
			$leaf_field = array(
				'type'     => $leaf['type'],
				'name'     => $leaf['name'],
				'key'      => $leaf['key'],
				'multiple' => false,
			);
			// Prefer the actual field array when we can still find it.
			$found = acf_get_field( $leaf['key'] ? $leaf['key'] : $leaf['name'] );
			if ( is_array( $found ) ) {
				$leaf_field = $found;
			}
		}
		list( $coerced, $err ) = muster_acf_coerce( $leaf_field, $new_raw, $warnings, $path );
		if ( $err ) {
			$path_errors = true;
			$row['error'] = $err;
			$row['old']   = $walk['value'];
			$row['new']   = $new_raw;
			$results[]    = $row;
			continue;
		}
		$old_json = function_exists( 'wp_json_encode' ) ? wp_json_encode( $walk['value'] ) : json_encode( $walk['value'] );
		$new_json = function_exists( 'wp_json_encode' ) ? wp_json_encode( $coerced ) : json_encode( $coerced );
		$row['old']     = $walk['value'];
		$row['new']     = $coerced;
		$row['changed'] = $old_json !== $new_json;
		$row['applied'] = false;
		$row['warnings'] = array();
		$row['trace']    = $walk['trace'];
		$row['root_key'] = $root_key;
		$results[]       = $row;
	}

	if ( $apply && $path_errors ) {
		foreach ( $results as &$row ) {
			if ( isset( $row['applied'] ) ) {
				$row['applied'] = false;
			}
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
			if ( ! isset( $pending[ $key ] ) ) {
				$pending[ $key ] = $roots[ $key ]['value'];
			}
			$pending[ $key ] = muster_acf_set_by_trace( $pending[ $key ], $row['trace'], $row['new'] );
		}
		$written = array();
		foreach ( $pending as $key => $value ) {
			$ok = update_field( $key, $value, $post_id );
			$written[ $key ] = (bool) $ok;
		}
		foreach ( $results as &$row ) {
			if ( ! isset( $row['root_key'] ) ) {
				continue;
			}
			$row['applied'] = ! empty( $written[ $row['root_key'] ] );
			$fresh          = get_field( $row['root_key'], $post_id, false );
			$got            = muster_acf_get_by_trace( $fresh, $row['trace'] );
			if ( $got['ok'] ) {
				$row['new'] = $got['value'];
			}
			unset( $row['trace'], $row['root_key'] );
		}
		unset( $row );
		$warnings[] = 'Object caches and page-cache plugins may still serve stale HTML.';
		return muster_acf_envelope(
			true,
			array(
				'warnings' => $warnings,
				'results'  => $results,
				'apply'    => true,
			)
		);
	}

	foreach ( $results as &$row ) {
		unset( $row['trace'], $row['root_key'] );
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
