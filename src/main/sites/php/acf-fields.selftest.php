<?php
define( 'MUSTER_ACF_NO_MAIN', true );
require __DIR__ . '/acf-fields.php';

function muster_acf_assert( $cond, $message ) {
	if ( ! $cond ) {
		fwrite( STDERR, "FAIL: {$message}\n" );
		exit( 1 );
	}
}

$parsed = muster_acf_parse_path( 'spacing_templates.9.name' );
muster_acf_assert( ! isset( $parsed['error'] ), 'parse spacing_templates.9.name' );
muster_acf_assert( $parsed['segments'][1]['index'] === 9, 'index 9 is 0-based storage 9' );

$bad = muster_acf_parse_path( '9.name' );
muster_acf_assert( isset( $bad['error'] ), 'index cannot be root' );

$rows = array();
for ( $i = 0; $i < 20; $i++ ) {
	$rows[] = array( 'name' => 'n' . $i );
}
$out = muster_acf_set_by_trace( $rows, array( 9, 'name' ), 'NEW' );
muster_acf_assert( $out[9]['name'] === 'NEW', 'set index 9' );
muster_acf_assert( $out[8]['name'] === 'n8', 'did not write index 8' );

$hero = array(
	'title'  => 'old',
	'kicker' => 'k',
);
$group = muster_acf_set_by_trace( $hero, array( 'title' ), 'new' );
muster_acf_assert( $group['title'] === 'new', 'group title' );
muster_acf_assert( ! array_key_exists( 0, $group ), 'group did not invent row 0' );

$warnings = array();
list( $id, $err ) = muster_acf_attachment_id(
	array(
		'ID'  => 42,
		'url' => 'https://x.test/a.jpg',
	),
	$warnings,
	'hero_image'
);
muster_acf_assert( $err === null && $id === 42, 'image array unwraps to ID' );
muster_acf_assert( count( $warnings ) === 1, 'formatted image warns' );

$run = muster_acf_run( array( 'mode' => 'get', 'target' => array( 'kind' => 'option' ), 'fields' => array( 'x' ) ) );
muster_acf_assert( $run['ok'] === false, 'ACF absent is a hard error' );
muster_acf_assert( strpos( $run['error'], 'ACF is not active' ) !== false, 'ACF absent message' );

$key_row = array( 'field_name_key' => 'Band 40', 'field_bp' => 60 );
$sub     = array(
	'name' => 'name',
	'key'  => 'field_name_key',
	'type' => 'text',
);
$slot    = muster_acf_value_slot( $key_row, $sub );
muster_acf_assert( $slot['found'] === true && $slot['value'] === 'Band 40', 'unformatted row is keyed by field key' );
muster_acf_assert( $slot['slot'] === 'field_name_key', 'trace slot is the field key' );

$name_row = array( 'name' => 'Band 40' );
$named    = muster_acf_value_slot( $name_row, $sub );
muster_acf_assert( $named['found'] === true && $named['slot'] === 'name', 'formatted row is keyed by name' );

$repeater_field = array(
	'name'       => 'spacing_templates',
	'key'        => 'field_root',
	'type'       => 'repeater',
	'sub_fields' => array(
		array(
			'name' => 'name',
			'key'  => 'field_name_key',
			'type' => 'text',
		),
	),
);
$unformatted    = array(
	array( 'field_name_key' => 'row0' ),
	array( 'field_name_key' => 'row1' ),
	array( 'field_name_key' => 'row2' ),
	array( 'field_name_key' => 'row3' ),
	array( 'field_name_key' => 'row4' ),
	array( 'field_name_key' => 'row5' ),
	array( 'field_name_key' => 'row6' ),
	array( 'field_name_key' => 'row7' ),
	array( 'field_name_key' => 'row8' ),
	array( 'field_name_key' => 'Band 40' ),
);
$segments       = array(
	array(
		'kind' => 'field',
		'name' => 'spacing_templates',
	),
	array(
		'kind'  => 'index',
		'index' => 9,
		'name'  => '9',
	),
	array(
		'kind' => 'field',
		'name' => 'name',
	),
);
$walk           = muster_acf_walk( $repeater_field, $unformatted, $segments, 'get' );
muster_acf_assert( ! isset( $walk['error'] ), 'key-keyed walk has no error' );
muster_acf_assert( $walk['value'] === 'Band 40', 'nested unformatted read is not null' );
muster_acf_assert( $walk['trace'] === array( 9, 'field_name_key' ), 'trace uses field key' );

$mutated = muster_acf_set_by_trace( $unformatted, $walk['trace'], 'NEW' );
muster_acf_assert( $mutated[9]['field_name_key'] === 'NEW', 'apply writes the field-key slot' );
muster_acf_assert( $mutated[8]['field_name_key'] === 'row8', 'sibling rows stay put' );

// ---------------------------------------------------------------------------
// Stubbed WordPress + ACF. Declared after the ACF-absent assertions above so
// muster_acf_run() sees a bare PHP process first, then a live-looking one.
// ---------------------------------------------------------------------------

$MUSTER_GROUPS = array(
	'group_opts'  => array( 'location' => array( array( array( 'param' => 'options_page', 'operator' => '==', 'value' => 'theme-options' ) ) ) ),
	'group_block' => array( 'location' => array( array( array( 'param' => 'block', 'operator' => '==', 'value' => 'acf/hero' ) ) ) ),
	'55'          => array( 'location' => array( array( array( 'param' => 'post_type', 'operator' => '==', 'value' => 'page' ) ) ) ),
	'77'          => array( 'location' => array( array( array( 'param' => 'block', 'operator' => '==', 'value' => 'acf/cta' ) ) ) ),
);

$MUSTER_FIELDS = array(
	array( 'key' => 'field_bc', 'name' => 'band_count', 'type' => 'number', 'parent' => 'group_opts' ),
	array( 'key' => 'field_hi', 'name' => 'hero_image', 'type' => 'image', 'parent' => 'group_opts' ),
	array(
		'key'        => 'field_st',
		'name'       => 'spacing_templates',
		'type'       => 'repeater',
		'parent'     => 'group_opts',
		'sub_fields' => array(
			array( 'key' => 'field_st_name', 'name' => 'name', 'type' => 'text', 'parent' => 'field_st' ),
			array( 'key' => 'field_st_bp', 'name' => 'bp', 'type' => 'number', 'parent' => 'field_st' ),
		),
	),
	array(
		'key'        => 'field_hero',
		'name'       => 'hero',
		'type'       => 'group',
		'parent'     => 'group_opts',
		'sub_fields' => array(
			array( 'key' => 'field_hero_title', 'name' => 'title', 'type' => 'text', 'parent' => 'field_hero' ),
		),
	),
	array(
		'key'     => 'field_mod',
		'name'    => 'modules',
		'type'    => 'flexible_content',
		'parent'  => 'group_opts',
		'layouts' => array(
			array(
				'name'       => 'hero',
				'sub_fields' => array(
					array( 'key' => 'field_mod_heading', 'name' => 'heading', 'type' => 'text', 'parent' => 'field_mod' ),
				),
			),
		),
	),
	// Rows type with no sub-fields registered: the unformatted read is a bare count.
	array( 'key' => 'field_cl', 'name' => 'countless', 'type' => 'repeater', 'parent' => 'group_opts' ),
	// Its sub-field key is unresolvable standalone, so only the walk still knows `multiple`.
	array(
		'key'        => 'field_or',
		'name'       => 'orphan_rep',
		'type'       => 'repeater',
		'parent'     => 'group_opts',
		'sub_fields' => array(
			array( 'key' => 'field_or_refs', 'name' => 'refs', 'type' => 'post_object', 'multiple' => 1, 'parent' => 'field_or' ),
		),
	),
	// Avalon shape: tabs/messages with no name, a seamless clone child (composite key), a repeater of groups.
	array(
		'key'     => 'field_av',
		'name'    => 'av_modules',
		'type'    => 'flexible_content',
		'parent'  => 'group_opts',
		'layouts' => array(
			array(
				'key'        => 'layout_text',
				'name'       => 'text',
				'label'      => 'Text',
				'sub_fields' => array(
					array( 'key' => 'field_av_tab', 'name' => '', 'type' => 'tab', 'label' => 'Content', 'parent' => 'field_av' ),
					array( 'key' => 'field_av_body', 'name' => 'body', 'type' => 'wysiwyg', 'parent' => 'field_av' ),
					array( 'key' => 'field_av_msg', 'name' => '', 'type' => 'message', 'parent' => 'field_av' ),
					array( 'key' => 'field_av_sid', 'name' => 'section_id', 'type' => 'text', 'parent' => 'field_av' ),
					array(
						'key'           => 'field_av_clone_field_bg',
						'name'          => 'module_bg_colour',
						'type'          => 'radio',
						'choices'       => array( 'white' => 'White', 'navy' => 'Navy' ),
						'default_value' => 'white',
						'parent'        => 'field_av',
					),
				),
			),
			array(
				'key'        => 'layout_quote',
				'name'       => 'quote',
				'label'      => 'Quote',
				'sub_fields' => array(
					array( 'key' => 'field_av_quote', 'name' => 'quote_text', 'type' => 'text', 'parent' => 'field_av' ),
				),
			),
			array(
				'key'        => 'layout_media',
				'name'       => 'media',
				'label'      => 'Media',
				'sub_fields' => array(
					// Two clone levels deep, the way the theme nests its shared settings.
					array(
						'key'        => 'field_av_clone_outer',
						'name'       => 'settings',
						'type'       => 'clone',
						'parent'     => 'field_av',
						'sub_fields' => array(
							array(
								'key'        => 'field_av_clone_inner',
								'name'       => 'colours',
								'type'       => 'clone',
								'parent'     => 'field_av_clone_outer',
								'sub_fields' => array(
									array(
										'key'     => 'field_av_deep_bg',
										'name'    => 'deep_bg_colour',
										'type'    => 'radio',
										'choices' => array( 'white' => 'White', 'navy' => 'Navy' ),
										'parent'  => 'field_av_clone_inner',
									),
								),
							),
						),
					),
					array(
						'key'        => 'field_av_slides',
						'name'       => 'slides',
						'type'       => 'repeater',
						'parent'     => 'field_av',
						'sub_fields' => array(
							array(
								'key'        => 'field_av_vs',
								'name'       => 'video_settings',
								'type'       => 'group',
								'parent'     => 'field_av_slides',
								'sub_fields' => array(
									array(
										'key'     => 'field_av_cs',
										'name'    => 'controls_settings',
										'type'    => 'checkbox',
										'choices' => array( 'play_pause' => 'Play/Pause', 'fullscreen' => 'Fullscreen' ),
										'parent'  => 'field_av_vs',
									),
								),
							),
						),
					),
				),
			),
		),
	),
	array( 'key' => 'field_bh', 'name' => 'block_heading', 'type' => 'text', 'parent' => 'group_block' ),
	// DB-stored fields carry numeric parents: 77 is a block group post, 88 is a repeater field post.
	array( 'key' => 'field_dbb', 'name' => 'db_block', 'type' => 'text', 'parent' => 77 ),
	array(
		'key'        => 'field_dbr',
		'name'       => 'db_rep',
		'type'       => 'repeater',
		'parent'     => 55,
		'ID'         => 88,
		'sub_fields' => array(
			array( 'key' => 'field_dbs', 'name' => 'db_sub', 'type' => 'text', 'parent' => 88 ),
		),
	),
);

$MUSTER_FIELD_IDS       = array( 88 => 'field_dbr' );
$MUSTER_DB              = array();
$MUSTER_UPDATE_CALLS    = array();
$MUSTER_FORMATTED_READS = 0;
$MUSTER_REJECT_WRITES   = array();

function muster_acf_test_reset() {
	global $MUSTER_DB, $MUSTER_UPDATE_CALLS, $MUSTER_REJECT_WRITES;
	$MUSTER_REJECT_WRITES = array();
	$MUSTER_DB           = array(
		'options_band_count'        => '60',
		'options_hero_image'        => '42',
		'options_countless'         => '3',
		'options_spacing_templates' => array(
			array( 'field_st_name' => 'Band 40', 'field_st_bp' => '40' ),
			array( 'field_st_name' => 'Band 60', 'field_st_bp' => '60' ),
		),
		'options_modules'           => array(
			array( 'acf_fc_layout' => 'hero', 'field_mod_heading' => 'Welcome' ),
		),
		'options_hero'              => array( 'field_hero_title' => 'Old title' ),
		'options_orphan_rep'        => array( array( 'field_or_refs' => array( '3' ) ) ),
		'options_av_modules'        => array(
			array(
				'acf_fc_layout'           => 'text',
				'field_av_body'           => '<h4>MEDIA</h4>',
				'field_av_sid'            => '',
				'field_av_clone_field_bg' => 'white',
			),
			array(
				'acf_fc_layout'   => 'media',
				'field_av_slides' => array(
					array( 'field_av_vs' => array( 'field_av_cs' => array( 'play_pause' ) ) ),
				),
			),
		),
	);
	$MUSTER_UPDATE_CALLS = array();
}

function muster_acf_test_match( $field, $id ) {
	if ( ( isset( $field['name'] ) && $field['name'] === $id ) || ( isset( $field['key'] ) && $field['key'] === $id ) ) {
		return $field;
	}
	$subs = isset( $field['sub_fields'] ) ? $field['sub_fields'] : array();
	foreach ( isset( $field['layouts'] ) ? $field['layouts'] : array() as $layout ) {
		foreach ( isset( $layout['sub_fields'] ) ? $layout['sub_fields'] : array() as $sub ) {
			$subs[] = $sub;
		}
	}
	foreach ( $subs as $sub ) {
		$hit = muster_acf_test_match( $sub, $id );
		if ( $hit ) {
			return $hit;
		}
	}
	return false;
}

/** Mirrors ACF: rows are stored keyed by sub-field key, meta scalars come back as strings. */
function muster_acf_test_store_rows( $parent, $rows ) {
	$out = array();
	foreach ( is_array( $rows ) ? $rows : array() as $row ) {
		if ( ! is_array( $row ) ) {
			$out[] = $row;
			continue;
		}
		$layout = isset( $row['acf_fc_layout'] ) ? $row['acf_fc_layout'] : null;
		$stored = array();
		if ( isset( $parent['type'] ) && $parent['type'] === 'flexible_content' ) {
			$stored['acf_fc_layout'] = $layout;
		}
		foreach ( muster_acf_layout_subfields( $parent, $layout ) as $sub ) {
			$type = isset( $sub['type'] ) ? $sub['type'] : '';
			$slot = muster_acf_value_slot( $row, $sub );
			if ( ! $slot['found'] ) {
				// ACF's re-read carries every scalar sub-field of the layout, filled with its default.
				if ( ! empty( $sub['key'] ) && muster_acf_is_value_type( $type )
					&& ! in_array( $type, array( 'repeater', 'flexible_content', 'group', 'clone' ), true ) ) {
					$stored[ $sub['key'] ] = isset( $sub['default_value'] ) ? (string) $sub['default_value'] : '';
				}
				continue;
			}
			$stored[ $sub['key'] ] = is_scalar( $slot['value'] ) ? (string) $slot['value'] : $slot['value'];
		}
		$out[] = $stored;
	}
	return $out;
}

if ( ! function_exists( 'acf_get_field' ) ) {
	function acf_get_field( $id ) {
		global $MUSTER_FIELDS, $MUSTER_FIELD_IDS;
		if ( is_numeric( $id ) ) {
			// A field-group post ID resolves to false in ACF, same as here.
			if ( ! isset( $MUSTER_FIELD_IDS[ (int) $id ] ) ) {
				return false;
			}
			$id = $MUSTER_FIELD_IDS[ (int) $id ];
		}
		// ACF cannot always resolve a sub-field key on its own; the walk is the only source for these.
		if ( $id === 'field_or_refs' || $id === 'refs' ) {
			return false;
		}
		foreach ( $MUSTER_FIELDS as $field ) {
			$hit = muster_acf_test_match( $field, $id );
			if ( $hit ) {
				return $hit;
			}
		}
		return false;
	}
}

if ( ! function_exists( 'acf_get_field_group' ) ) {
	function acf_get_field_group( $id ) {
		global $MUSTER_GROUPS;
		$key = (string) $id;
		return isset( $MUSTER_GROUPS[ $key ] ) ? $MUSTER_GROUPS[ $key ] : false;
	}
}

if ( ! function_exists( 'acf_is_field_key' ) ) {
	function acf_is_field_key( $id ) {
		return is_string( $id ) && strpos( $id, 'field_' ) === 0;
	}
}

if ( ! function_exists( 'acf_is_field_group_key' ) ) {
	function acf_is_field_group_key( $id ) {
		return is_string( $id ) && strpos( $id, 'group_' ) === 0;
	}
}

if ( ! function_exists( 'get_field' ) ) {
	function get_field( $selector, $post_id, $format ) {
		global $MUSTER_DB, $MUSTER_FORMATTED_READS;
		$field = acf_get_field( $selector );
		if ( ! $field ) {
			return null;
		}
		$key = 'options_' . $field['name'];
		$raw = array_key_exists( $key, $MUSTER_DB ) ? $MUSTER_DB[ $key ] : null;
		if ( ! $format ) {
			return $raw;
		}
		$MUSTER_FORMATTED_READS++;
		// Formatted rows are name-keyed and carry objects; they must never reach old/new.
		return is_numeric( $raw )
			? array( array( 'x' => array( 'ID' => 9, 'url' => 'https://selftest.test/a.jpg' ) ) )
			: $raw;
	}
}

if ( ! function_exists( 'update_field' ) ) {
	function update_field( $selector, $value, $post_id ) {
		global $MUSTER_DB, $MUSTER_UPDATE_CALLS, $MUSTER_REJECT_WRITES;
		$MUSTER_UPDATE_CALLS[] = $selector;
		$field = acf_get_field( $selector );
		if ( ! $field ) {
			return false;
		}
		// Stands in for a filter or a save that silently drops the value.
		if ( in_array( $selector, $MUSTER_REJECT_WRITES, true ) ) {
			return false;
		}
		$key  = 'options_' . $field['name'];
		$old  = array_key_exists( $key, $MUSTER_DB ) ? $MUSTER_DB[ $key ] : null;
		$type = isset( $field['type'] ) ? $field['type'] : '';
		if ( $type === 'repeater' || $type === 'flexible_content' ) {
			$value = muster_acf_test_store_rows( $field, $value );
		} elseif ( is_scalar( $value ) ) {
			$value = (string) $value;
		}
		$MUSTER_DB[ $key ] = $value;
		// WP returns false when the stored root is unchanged; for a repeater that root is the row count.
		$old_scalar = is_array( $old ) ? count( $old ) : $old;
		$new_scalar = is_array( $value ) ? count( $value ) : $value;
		return (string) $old_scalar !== (string) $new_scalar;
	}
}

if ( ! function_exists( 'get_option' ) ) {
	function get_option( $name ) {
		return 'https://selftest.test';
	}
}

if ( ! function_exists( 'acf_get_setting' ) ) {
	function acf_get_setting( $name ) {
		return '6.4.2';
	}
}

if ( ! function_exists( 'wp_json_encode' ) ) {
	function wp_json_encode( $value ) {
		return json_encode( $value );
	}
}

if ( ! function_exists( 'get_post' ) ) {
	function get_post( $id ) {
		return (int) $id === 672 ? (object) array( 'ID' => 672 ) : false;
	}
}

if ( ! function_exists( 'get_post_type' ) ) {
	function get_post_type( $id ) {
		return (int) $id === 672 ? 'page' : false;
	}
}

function muster_acf_test_rule_matches( $group, $param, $value ) {
	foreach ( isset( $group['location'] ) ? $group['location'] : array() as $rule_group ) {
		foreach ( $rule_group as $rule ) {
			if ( $rule['param'] === $param && $rule['value'] === $value ) {
				return true;
			}
		}
	}
	return false;
}

if ( ! function_exists( 'acf_get_options_pages' ) ) {
	function acf_get_options_pages() {
		return array(
			'theme-options' => array(
				'menu_slug' => 'theme-options',
				'post_id'   => 'options',
			),
		);
	}
}

if ( ! function_exists( 'acf_get_field_groups' ) ) {
	function acf_get_field_groups( $filter = array() ) {
		global $MUSTER_GROUPS;
		$out = array();
		foreach ( $MUSTER_GROUPS as $key => $group ) {
			$group['key'] = (string) $key;
			if ( count( $filter ) === 0 ) {
				$out[] = $group;
				continue;
			}
			if ( isset( $filter['options_page'] ) && muster_acf_test_rule_matches( $group, 'options_page', $filter['options_page'] ) ) {
				$out[] = $group;
				continue;
			}
			// Mirrors ACF: a post_id screen arg resolves the post type before matching.
			if ( isset( $filter['post_id'] ) && muster_acf_test_rule_matches( $group, 'post_type', get_post_type( $filter['post_id'] ) ) ) {
				$out[] = $group;
			}
		}
		return $out;
	}
}

if ( ! function_exists( 'acf_get_fields' ) ) {
	function acf_get_fields( $group ) {
		global $MUSTER_FIELDS;
		$key = isset( $group['key'] ) ? (string) $group['key'] : '';
		$out = array();
		foreach ( $MUSTER_FIELDS as $field ) {
			if ( isset( $field['parent'] ) && (string) $field['parent'] === $key ) {
				$out[] = $field;
			}
		}
		return $out;
	}
}

function muster_acf_test_describe( $fields = array(), $layout_filter = null, $target = null ) {
	$payload = array(
		'mode'   => 'describe',
		'target' => $target === null ? array( 'kind' => 'option' ) : $target,
		'fields' => $fields,
	);
	if ( $layout_filter !== null ) {
		$payload['layout_filter'] = $layout_filter;
	}
	return muster_acf_run( $payload );
}

function muster_acf_test_rows( $mode, $rows, $fields = array() ) {
	return muster_acf_run(
		array(
			'mode'   => $mode,
			'target' => array( 'kind' => 'option' ),
			'fields' => $fields,
			'rows'   => $rows,
		)
	);
}

function muster_acf_test_entry( $run, $path ) {
	foreach ( $run['results'] as $entry ) {
		if ( isset( $entry['path'] ) && $entry['path'] === $path ) {
			return $entry;
		}
	}
	return null;
}

function muster_acf_test_names( $subs ) {
	$names = array();
	foreach ( $subs as $sub ) {
		$names[] = $sub['name'];
	}
	return $names;
}

function muster_acf_test_run( $mode, $fields ) {
	return muster_acf_run(
		array(
			'mode'   => $mode,
			'target' => array( 'kind' => 'option' ),
			'fields' => $fields,
		)
	);
}

function muster_acf_test_has_warning( $warnings, $needle ) {
	foreach ( (array) $warnings as $warning ) {
		if ( strpos( $warning, $needle ) !== false ) {
			return true;
		}
	}
	return false;
}

// --- 1. A sub-cell write returns false from update_field but did land. -------
muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'spacing_templates.1.name', 'value' => 'Band 80' ) ) );
$row = $run['results'][0];
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][1]['field_st_name'] === 'Band 80', 'sub-cell reached the DB' );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][0]['field_st_name'] === 'Band 40', 'sibling row untouched' );
muster_acf_assert( $row['applied'] === true, 'applied comes from the re-read, not update_field' );
muster_acf_assert( $run['apply'] === true, 'envelope apply is true' );
muster_acf_assert( $row['changed'] === true, 'a real change is reported as changed' );
muster_acf_assert( $row['new'] === 'Band 80', 'new is the re-read value' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 1, 'update_field called once per root' );
muster_acf_assert( $MUSTER_UPDATE_CALLS[0] === 'field_st', 'update_field called with the field key' );
muster_acf_assert( muster_acf_test_has_warning( $run['warnings'], 'stale' ), 'stale cache warning present' );
foreach ( array( 'trace', 'root_key', 'leaf_field', 'leaf_is_row' ) as $internal ) {
	muster_acf_assert( ! array_key_exists( $internal, $row ), "internal key '{$internal}' stays out of the envelope" );
}

// --- 2. Whole row sent name-keyed, stored key-keyed. -------------------------
muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'spacing_templates.0', 'value' => array( 'name' => 'Band 10', 'bp' => 10 ) ) ) );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][0]['field_st_name'] === 'Band 10', 'name-keyed row stored under the key' );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][0]['field_st_bp'] === '10', 'number stored as a string' );
muster_acf_assert( $run['results'][0]['applied'] === true, 'name-keyed row compares equal to the key-keyed re-read' );

// --- 3. Whole repeater rewrite. ---------------------------------------------
muster_acf_test_reset();
$run = muster_acf_test_run(
	'apply',
	array(
		array(
			'path'  => 'spacing_templates',
			'value' => array(
				array( 'name' => 'Only', 'bp' => 5 ),
			),
		),
	)
);
muster_acf_assert( count( $MUSTER_DB['options_spacing_templates'] ) === 1, 'whole repeater rewrite drops the second row' );
muster_acf_assert( $run['results'][0]['applied'] === true, 'whole repeater rewrite reports applied' );

// --- 4. Preview compares stored strings against sent numbers. ---------------
muster_acf_test_reset();
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'band_count', 'value' => 60 ) ) );
muster_acf_assert( $run['results'][0]['changed'] === false, '60 against stored "60" is unchanged' );
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'band_count', 'value' => 61 ) ) );
muster_acf_assert( $run['results'][0]['changed'] === true, '61 against stored "60" is changed' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 0, 'preview writes nothing' );

// --- 5. Block-located roots are refused, local key and numeric parent alike. -
foreach ( array( 'block_heading', 'db_block' ) as $blocked ) {
	$run = muster_acf_test_run( 'preview', array( array( 'path' => $blocked, 'value' => 'x' ) ) );
	$row = $run['results'][0];
	muster_acf_assert( isset( $row['error'] ) && strpos( $row['error'], 'block' ) !== false, "{$blocked} is refused as a block field" );
	muster_acf_assert( $row['exists'] === false, "{$blocked} does not report exists" );
	muster_acf_assert( ! isset( $row['applied'] ), "{$blocked} is never applied" );
}
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'band_count', 'value' => 1 ) ) );
muster_acf_assert( ! isset( $run['results'][0]['error'] ), 'a non-block group is not refused' );

// --- 6. A sub-field name is not a root. -------------------------------------
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'bp', 'value' => 5 ) ) );
muster_acf_assert(
	$run['results'][0]['error'] === "'bp' is a sub-field of 'spacing_templates'; address it as spacing_templates.<row>.bp",
	'repeater sub-field names the dotted row path'
);
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'title', 'value' => 'x' ) ) );
muster_acf_assert(
	$run['results'][0]['error'] === "'title' is a sub-field of 'hero'; address it as hero.title",
	'group sub-field omits the row index'
);
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'db_sub', 'value' => 'x' ) ) );
muster_acf_assert(
	$run['results'][0]['error'] === "'db_sub' is a sub-field of 'db_rep'; address it as db_rep.<row>.db_sub",
	'numeric parent resolves to the parent field'
);

muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'bp', 'value' => 5 ) ) );
muster_acf_assert( $run['apply_skipped'] === true, 'a sub-field root skips the whole apply' );
muster_acf_assert( $run['apply'] === false, 'apply is false when skipped' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 0, 'nothing is written when a path fails' );
muster_acf_assert( ! array_key_exists( 'options_bp', $MUSTER_DB ), 'no stray top-level meta row' );

// --- 7. null clears a value field. ------------------------------------------
muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'hero_image', 'value' => null ) ) );
$row = $run['results'][0];
muster_acf_assert( muster_acf_test_has_warning( $run['warnings'], 'hero_image: null clears the value' ), 'null warns' );
muster_acf_assert( $row['old'] === '42', 'old is the stored attachment ID' );
muster_acf_assert( $MUSTER_DB['options_hero_image'] === null, 'null reached the DB' );
muster_acf_assert( $row['applied'] === true, 'a cleared field counts as applied' );
muster_acf_assert( $row['changed'] === true, 'clearing a set field is a change' );

// --- 8. Flexible content rows. ----------------------------------------------
muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'modules.0.heading', 'value' => 'Hello' ) ) );
muster_acf_assert( $MUSTER_DB['options_modules'][0]['field_mod_heading'] === 'Hello', 'flex sub-field written by key' );
muster_acf_assert( $run['results'][0]['applied'] === true, 'flex sub-field applied' );

muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'modules.0', 'value' => array( 'acf_fc_layout' => 'hero', 'heading' => 'Row' ) ) ) );
muster_acf_assert( $MUSTER_DB['options_modules'][0]['field_mod_heading'] === 'Row', 'whole flex row written' );
muster_acf_assert( $run['results'][0]['applied'] === true, 'whole flex row applied' );

$run = muster_acf_test_run( 'preview', array( array( 'path' => 'modules.0', 'value' => array( 'heading' => 'Row' ) ) ) );
muster_acf_assert(
	isset( $run['results'][0]['error'] ) && strpos( $run['results'][0]['error'], 'acf_fc_layout' ) !== false,
	'a flex row without acf_fc_layout is refused'
);

// --- 9. A rows root with no sub-fields never falls back to formatted values. -
muster_acf_test_reset();
$run = muster_acf_test_run( 'get', array( 'countless.0.x' ) );
$row = $run['results'][0];
muster_acf_assert( isset( $row['error'] ) && strpos( $row['error'], 'count=0' ) !== false, 'a bare row count reads as an empty array' );

// --- 10. The leaf field comes from the walk, so `multiple` survives. --------
muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'orphan_rep.0.refs', 'value' => array( 7, 8 ) ) ) );
$row = $run['results'][0];
muster_acf_assert( ! isset( $row['error'] ), 'a multiple post_object sub-field accepts an array of IDs' );
muster_acf_assert( $MUSTER_DB['options_orphan_rep'][0]['field_or_refs'] === array( 7, 8 ), 'both IDs written' );
muster_acf_assert( $row['applied'] === true, 'multiple post_object applied' );

// --- 11. Container reads come back keyed by sub-field name. ------------------
muster_acf_test_reset();
$run = muster_acf_test_run( 'get', array( 'av_modules.0' ) );
$value = $run['results'][0]['value'];
muster_acf_assert( $value['acf_fc_layout'] === 'text', 'flex row keeps acf_fc_layout' );
muster_acf_assert( $value['body'] === '<h4>MEDIA</h4>', 'flex row sub-field is name-keyed' );
muster_acf_assert( $value['module_bg_colour'] === 'white', 'seamless clone child is name-keyed' );
muster_acf_assert( array_keys( $value ) === array( 'acf_fc_layout', 'body', 'section_id', 'module_bg_colour' ), 'no composite keys survive' );

$run   = muster_acf_test_run( 'get', array( 'av_modules.1.slides' ) );
$slides = $run['results'][0]['value'];
muster_acf_assert( array_keys( $slides[0] ) === array( 'video_settings' ), 'repeater rows are name-keyed' );
muster_acf_assert( $slides[0]['video_settings']['controls_settings'] === array( 'play_pause' ), 'nested group recurses' );

$run = muster_acf_test_run( 'get', array( 'av_modules.1.slides.0.video_settings' ) );
muster_acf_assert( $run['results'][0]['value'] === array( 'controls_settings' => array( 'play_pause' ) ), 'group read is name-keyed' );

$run = muster_acf_test_run( 'get', array( 'av_modules' ) );
$rows = $run['results'][0]['value'];
muster_acf_assert( count( $rows ) === 2 && $rows[1]['slides'][0]['video_settings']['controls_settings'] === array( 'play_pause' ), 'whole flex field presents every level' );

$run = muster_acf_test_run( 'get', array( 'av_modules.0.body' ) );
muster_acf_assert( $run['results'][0]['value'] === '<h4>MEDIA</h4>', 'a scalar leaf is left alone' );

// --- 12. acf_fc_layout is readable on a flex row, never writable. ------------
$run = muster_acf_test_run( 'get', array( 'av_modules.0.acf_fc_layout' ) );
$row = $run['results'][0];
muster_acf_assert( $row['value'] === 'text', 'acf_fc_layout reads the layout name' );
muster_acf_assert( $row['field']['name'] === 'acf_fc_layout' && $row['field']['type'] === 'layout', 'acf_fc_layout reports a pseudo field' );
muster_acf_assert( $row['field']['key'] === '' && $row['field']['parent_layout'] === 'text', 'acf_fc_layout carries the row layout' );

$run = muster_acf_test_run( 'preview', array( array( 'path' => 'av_modules.0.acf_fc_layout', 'value' => 'media' ) ) );
muster_acf_assert(
	$run['results'][0]['error'] === 'acf_fc_layout is read-only; rewrite the row or use a row operation',
	'acf_fc_layout is a per-path write error'
);
muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'av_modules.0.acf_fc_layout', 'value' => 'media' ) ) );
muster_acf_assert( $run['apply_skipped'] === true && count( $MUSTER_UPDATE_CALLS ) === 0, 'an acf_fc_layout write skips the apply' );

$run = muster_acf_test_run( 'get', array( 'spacing_templates.0.acf_fc_layout' ) );
muster_acf_assert(
	strpos( $run['results'][0]['error'], "subfield 'acf_fc_layout' not found" ) === 0,
	'acf_fc_layout is not a repeater sub-field'
);

// --- 13. Tabs, messages and empty names stay out of "Available". ------------
$run = muster_acf_test_run( 'get', array( 'av_modules.0.nope_field' ) );
muster_acf_assert(
	$run['results'][0]['error'] === "subfield 'nope_field' not found on layout 'text'. Available: body, section_id, module_bg_colour",
	'available names skip tab/message/empty'
);

// --- 14. Unknown choices warn, never block. ---------------------------------
muster_acf_test_reset();
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'av_modules.0.module_bg_colour', 'value' => 'definitely-not-a-choice' ) ) );
muster_acf_assert( ! isset( $run['results'][0]['error'] ), 'an unknown choice is not an error' );
muster_acf_assert(
	muster_acf_test_has_warning( $run['warnings'], "'definitely-not-a-choice' is not a registered choice. Valid: white, navy" ),
	'radio warns with the value and the valid keys'
);
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'av_modules.0.module_bg_colour', 'value' => 'navy' ) ) );
muster_acf_assert( ! muster_acf_test_has_warning( $run['warnings'], 'not a registered choice' ), 'a valid choice is silent' );
$run = muster_acf_test_run(
	'preview',
	array( array( 'path' => 'av_modules.1.slides.0.video_settings.controls_settings', 'value' => array( 'play_pause', 'nope' ) ) )
);
muster_acf_assert( muster_acf_test_has_warning( $run['warnings'], "'nope' is not a registered choice" ), 'checkbox warns per element' );
muster_acf_assert( ! muster_acf_test_has_warning( $run['warnings'], "'play_pause' is not" ), 'a valid element is silent' );

// --- 15. A skipped apply is not ok; a preview with path errors still is. -----
muster_acf_test_reset();
$run = muster_acf_test_run(
	'apply',
	array(
		array( 'path' => 'band_count', 'value' => 7 ),
		array( 'path' => 'nope_root', 'value' => 'x' ),
	)
);
muster_acf_assert( $run['ok'] === false, 'a skipped apply reports ok false' );
muster_acf_assert( $run['apply'] === false && $run['apply_skipped'] === true, 'skipped apply keeps its flags' );
muster_acf_assert( muster_acf_test_has_warning( $run['warnings'], 'apply skipped' ), 'skipped apply keeps the warning' );
muster_acf_assert( isset( $run['results'][1]['error'] ), 'skipped apply keeps the per-row error' );
muster_acf_assert( $run['revert']['fields'] === array(), 'a skipped apply reverts nothing' );
muster_acf_assert( $MUSTER_DB['options_band_count'] === '60', 'a skipped apply writes nothing' );

$run = muster_acf_test_run( 'preview', array( array( 'path' => 'nope_root', 'value' => 'x' ) ) );
muster_acf_assert( $run['ok'] === true, 'a preview with path errors stays ok' );

// --- 16. A row path describes the container, not the row's layout. -----------
$run = muster_acf_test_run( 'get', array( 'av_modules.0' ) );
$field = $run['results'][0]['field'];
muster_acf_assert( $field['name'] === 'av_modules' && $field['parent_layout'] === null, 'a root row path has no parent layout' );
muster_acf_assert( $field['layout'] === 'text', 'a row path names its own layout' );

$run = muster_acf_test_run( 'get', array( 'av_modules.1.slides.0' ) );
$field = $run['results'][0]['field'];
muster_acf_assert( $field['name'] === 'slides' && $field['layout'] === null, 'a repeater row has a null layout' );
muster_acf_assert( $field['parent_layout'] === 'media', 'a nested container keeps its enclosing layout' );

$run = muster_acf_test_run( 'get', array( 'av_modules.0.body' ) );
$field = $run['results'][0]['field'];
muster_acf_assert( $field['parent_layout'] === 'text' && ! array_key_exists( 'layout', $field ), 'a sub-field keeps parent_layout only' );

$run = muster_acf_test_run( 'get', array( 'spacing_templates.0' ) );
muster_acf_assert( $run['results'][0]['field']['layout'] === null, 'a repeater root row has a null layout' );

// --- 17. Revert payload round-trips through the walker. ---------------------
muster_acf_test_reset();
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'av_modules.0.section_id', 'value' => 'muster-test-1' ) ) );
muster_acf_assert( $run['revert']['target'] === array( 'kind' => 'option' ), 'revert echoes the target as received' );
muster_acf_assert( $run['revert']['fields'] === array( array( 'path' => 'av_modules.0.section_id', 'value' => '' ) ), 'preview reverts every changed row' );

$run = muster_acf_test_run( 'preview', array( array( 'path' => 'av_modules.0.section_id', 'value' => '' ) ) );
muster_acf_assert( $run['revert']['fields'] === array(), 'an unchanged preview reverts nothing' );

muster_acf_test_reset();
$run    = muster_acf_test_run( 'apply', array( array( 'path' => 'av_modules.0.section_id', 'value' => 'muster-test-1' ) ) );
$revert = $run['revert'];
muster_acf_assert( $run['results'][0]['applied'] === true, 'the test write applied' );
muster_acf_assert( $revert['fields'] === array( array( 'path' => 'av_modules.0.section_id', 'value' => '' ) ), 'apply reverts every applied row' );
$back = muster_acf_test_run( 'preview', $revert['fields'] );
muster_acf_assert( $back['results'][0]['old'] === 'muster-test-1', 'the revert preview sees the written value' );
muster_acf_assert( $back['results'][0]['new'] === '' && $back['results'][0]['changed'] === true, 'the revert preview restores old' );
$done = muster_acf_test_run( 'apply', $revert['fields'] );
muster_acf_assert( $done['results'][0]['applied'] === true, 'the revert applies' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][0]['field_av_sid'] === '', 'storage is back where it started' );

muster_acf_test_reset();
$run = muster_acf_test_run(
	'apply',
	array(
		array(
			'path'  => 'av_modules.0',
			'value' => array(
				'acf_fc_layout'    => 'text',
				'body'             => 'New body',
				'section_id'       => 'sid',
				'module_bg_colour' => 'navy',
			),
		),
	)
);
$revert = $run['revert'];
muster_acf_assert( count( $revert['fields'] ) === 1, 'a whole-row apply reverts one path' );
muster_acf_assert(
	$revert['fields'][0]['value'] === array(
		'acf_fc_layout'    => 'text',
		'body'             => '<h4>MEDIA</h4>',
		'section_id'       => '',
		'module_bg_colour' => 'white',
	),
	'the reverted row is name-keyed'
);
$done = muster_acf_test_run( 'apply', $revert['fields'] );
muster_acf_assert( $done['results'][0]['applied'] === true, 'the row revert applies' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][0]['field_av_body'] === '<h4>MEDIA</h4>', 'the row is back where it started' );

muster_acf_test_reset();
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'hero_image', 'value' => null ) ) );
muster_acf_assert( $run['revert']['fields'] === array( array( 'path' => 'hero_image', 'value' => '42' ) ), 'a cleared field reverts to its old ID' );
$run = muster_acf_test_run( 'get', array( 'hero_image' ) );
muster_acf_assert( $run['results'][0]['value'] === null, 'a cleared field reads as null' );
muster_acf_assert( ! isset( $run['revert'] ), 'get carries no revert payload' );

// A row rejected by the coercer echoes the value as sent and still presents old.
muster_acf_test_reset();
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'av_modules.0', 'value' => 'not-a-row' ) ) );
$row = $run['results'][0];
muster_acf_assert( isset( $row['error'] ) && $row['new'] === 'not-a-row', 'a rejected value is echoed unchanged' );
muster_acf_assert( $row['old']['body'] === '<h4>MEDIA</h4>', 'a rejected row still presents old' );

// --- 17b. A choice warning reaches the path it came from. ------------------
muster_acf_test_reset();
$run = muster_acf_test_run( 'preview', array( array( 'path' => 'av_modules.1.deep_bg_colour', 'value' => 'not-a-choice' ) ) );
$row = $run['results'][0];
muster_acf_assert( ! isset( $row['error'] ), 'a radio two clone levels deep resolves' );
muster_acf_assert(
	muster_acf_test_has_warning( $run['warnings'], "'not-a-choice' is not a registered choice. Valid: white, navy" ),
	'a deep clone still carries its choices'
);
muster_acf_assert(
	muster_acf_test_has_warning( $row['warnings'], "'not-a-choice' is not a registered choice" ),
	'the warning lands on the result row too'
);
muster_acf_assert( $run['results'][0]['field']['name'] === 'deep_bg_colour', 'the deep field resolves by name' );

// --- 18. Describe without paths lists the groups that apply to the target. ---
muster_acf_test_reset();
$run = muster_acf_test_describe();
muster_acf_assert( $run['ok'] === true && $run['describe'] === true && $run['truncated'] === false, 'describe answers a describe envelope' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 0, 'describe writes nothing' );
muster_acf_assert( muster_acf_test_entry( $run, 'block_heading' ) === null, 'describe leaves block groups out' );

$flex = muster_acf_test_entry( $run, 'av_modules' );
muster_acf_assert( $flex['field'] === array( 'name' => 'av_modules', 'key' => 'field_av', 'type' => 'flexible_content', 'label' => '' ), 'describe names the field' );
muster_acf_assert( $flex['rows'] === 2, 'describe counts flex rows' );
muster_acf_assert( $flex['row_layouts'] === array( array( 'index' => 0, 'layout' => 'text' ), array( 'index' => 1, 'layout' => 'media' ) ), 'describe indexes every row layout' );
muster_acf_assert( count( $flex['layouts'] ) === 3 && $flex['layouts'][0]['name'] === 'text' && $flex['layouts'][0]['label'] === 'Text', 'describe lists layouts' );
muster_acf_assert(
	muster_acf_test_names( $flex['layouts'][0]['sub_fields'] ) === array( 'body', 'section_id', 'module_bg_colour' ),
	'layout sub-fields skip tab/message/empty'
);
muster_acf_assert( $flex['layouts'][0]['sub_fields'][2]['choices'] === array( 'white' => 'White', 'navy' => 'Navy' ), 'sub-field choices are listed' );
muster_acf_assert( ! isset( $flex['where'] ), 'no layout_filter means no where' );

$rep = muster_acf_test_entry( $run, 'spacing_templates' );
muster_acf_assert( $rep['rows'] === 2 && muster_acf_test_names( $rep['sub_fields'] ) === array( 'name', 'bp' ), 'describe covers repeaters' );
$grp = muster_acf_test_entry( $run, 'hero' );
muster_acf_assert( muster_acf_test_names( $grp['sub_fields'] ) === array( 'title' ), 'describe covers groups' );
$scalar = muster_acf_test_entry( $run, 'band_count' );
muster_acf_assert( ! isset( $scalar['rows'] ) && ! isset( $scalar['sub_fields'] ), 'a scalar field describes as itself' );

$run = muster_acf_test_describe( array(), 'media' );
muster_acf_assert( muster_acf_test_entry( $run, 'av_modules' )['where'] === array( 'layout' => 'media', 'indexes' => array( 1 ) ), 'layout_filter answers which rows use it' );
$filtered = muster_acf_test_entry( muster_acf_test_describe( array(), 'media' ), 'av_modules' );
muster_acf_assert( count( $filtered['layouts'] ) === 1 && $filtered['layouts'][0]['name'] === 'media', 'layout_filter narrows the layouts described' );
muster_acf_assert( $filtered['row_layouts'] === array( array( 'index' => 1, 'layout' => 'media' ) ), 'layout_filter narrows row_layouts to its own rows' );
muster_acf_assert( $filtered['rows'] === 2, 'the row count still counts the whole field' );

$unused = muster_acf_test_entry( muster_acf_test_describe( array(), 'quote' ), 'av_modules' );
muster_acf_assert( $unused['row_layouts'] === array() && $unused['where']['indexes'] === array(), 'a registered but unused layout narrows to nothing' );
muster_acf_assert( count( $unused['layouts'] ) === 1, 'and still describes that layout' );

$missing = muster_acf_test_entry( muster_acf_test_describe( array(), 'nothing' ), 'av_modules' );
muster_acf_assert( $missing['exists'] === false, 'an unknown layout name does not describe' );
muster_acf_assert(
	$missing['error'] === "unknown layout 'nothing' on 'av_modules'. Layouts: text, quote, media",
	'an unknown layout names the real ones'
);

$run = muster_acf_test_describe( array(), null, array( 'kind' => 'post', 'id' => 672 ) );
muster_acf_assert( muster_acf_test_entry( $run, 'db_rep' ) !== null, 'a post target describes its own groups' );
muster_acf_assert( muster_acf_test_entry( $run, 'av_modules' ) === null, 'option groups stay off a post target' );

// --- 19. Describe by path walks to a container. ------------------------------
$run   = muster_acf_test_describe( array( 'av_modules.1.slides' ) );
$entry = muster_acf_test_entry( $run, 'av_modules.1.slides' );
muster_acf_assert( $entry['field']['name'] === 'slides' && $entry['field']['type'] === 'repeater', 'a container path describes that container' );
muster_acf_assert( $entry['rows'] === 1 && muster_acf_test_names( $entry['sub_fields'] ) === array( 'video_settings' ), 'nested repeater rows and sub-fields' );

$entry = muster_acf_test_entry( muster_acf_test_describe( array( 'av_modules.0' ) ), 'av_modules.0' );
muster_acf_assert( $entry['layout'] === 'text', 'a row path describes that row layout' );
muster_acf_assert( muster_acf_test_names( $entry['sub_fields'] ) === array( 'body', 'section_id', 'module_bg_colour' ), 'a row path lists its own sub-fields' );

$entry = muster_acf_test_entry( muster_acf_test_describe( array( 'nope_root' ) ), 'nope_root' );
muster_acf_assert( strpos( $entry['error'], 'not registered' ) !== false, 'describe reports an unknown root' );
$entry = muster_acf_test_entry( muster_acf_test_describe( array( 'av_modules.*' ) ), 'av_modules.*' );
muster_acf_assert( $entry['error'] === 'wildcards are not valid in describe.', 'describe refuses wildcards' );

// --- 20. Long choice lists and oversized envelopes shed detail. --------------
$long = array();
for ( $i = 0; $i < 51; $i++ ) {
	$long[ 'c' . $i ] = 'Choice ' . $i;
}
$described = muster_acf_describe_subfields( array( array( 'name' => 'big', 'type' => 'select', 'choices' => $long ) ) );
muster_acf_assert( $described[0]['choices_count'] === 51 && ! isset( $described[0]['choices'] ), 'over 50 choices become a count' );

// Shaped like the real page: a handful of flexible fields, each layout carrying cloned selects.
$choices = array();
for ( $i = 0; $i < 20; $i++ ) {
	$choices[ 'opt' . $i ] = '<span class="swatch" style="background:#abcdef"></span> Option ' . $i;
}
$subs = array();
for ( $i = 0; $i < 40; $i++ ) {
	$subs[] = array( 'name' => 'sub' . $i, 'type' => 'select', 'label' => str_repeat( 'Label ', 20 ), 'choices' => $choices );
}
$bulky = array();
for ( $i = 0; $i < 20; $i++ ) {
	$bulky[] = array(
		'path'    => 'flex' . $i,
		'field'   => array( 'name' => 'flex' . $i, 'key' => 'k', 'type' => 'flexible_content', 'label' => '' ),
		'layouts' => array( array( 'name' => 'one', 'label' => '', 'sub_fields' => muster_acf_describe_subfields( $subs ) ) ),
	);
}
muster_acf_assert( strlen( json_encode( $bulky ) ) > 262144, 'the fixture is over the cap before truncation' );
list( $shrunk, $shrunk_warnings, $was_truncated ) = muster_acf_describe_truncate( $bulky, array() );
muster_acf_assert( $was_truncated === true, 'an oversized describe truncates' );
muster_acf_assert( muster_acf_test_has_warning( $shrunk_warnings, 'describe truncated' ), 'truncation says so in warnings' );
muster_acf_assert( strlen( json_encode( $shrunk ) ) <= 262144, 'the truncated envelope fits the cap' );

// --- 21. Wildcards expand over rows and skip layouts without the field. ------
muster_acf_test_reset();
$run = muster_acf_test_run( 'get', array( 'av_modules.*.section_id' ) );
$row = $run['results'][0];
muster_acf_assert( $row['wildcard'] === true && $row['exists'] === true, 'a pattern reports itself as a wildcard' );
muster_acf_assert( $row['count'] === 1 && count( $row['matches'] ) === 1, 'only the text row has section_id' );
muster_acf_assert( $row['matches'][0]['index_path'] === array( 0 ), 'the match carries its index path' );
muster_acf_assert( $row['matches'][0]['path'] === 'av_modules.0.section_id', 'the match carries a concrete path' );
muster_acf_assert( $row['matches'][0]['value'] === '', 'the match carries the value' );
muster_acf_assert(
	$row['matches'][0]['field'] === array( 'key' => 'field_av_sid', 'type' => 'text' ),
	'a match carries the key and type only'
);
muster_acf_assert( $row['skipped'] === array( array( 'index_path' => array( 1 ), 'layout' => 'media' ) ), 'a layout without the field is skipped, not an error' );
muster_acf_assert( ! isset( $row['truncated'] ), 'a small pattern is not truncated' );

$row = muster_acf_test_run( 'get', array( 'av_modules.*.acf_fc_layout' ) )['results'][0];
muster_acf_assert( $row['count'] === 2, 'acf_fc_layout matches every flex row' );
muster_acf_assert( $row['matches'][0]['value'] === 'text' && $row['matches'][1]['value'] === 'media', 'the layout of each row' );

$row = muster_acf_test_run( 'get', array( 'av_modules.*' ) )['results'][0];
muster_acf_assert( $row['count'] === 2 && $row['matches'][0]['value']['body'] === '<h4>MEDIA</h4>', 'a trailing star presents whole rows' );
muster_acf_assert( $row['matches'][1]['field'] === array( 'key' => 'field_av', 'type' => 'flexible_content' ), 'a row match names the container field' );

$row = muster_acf_test_run( 'get', array( 'av_modules.*.slides.*.video_settings.controls_settings' ) )['results'][0];
muster_acf_assert( $row['count'] === 1, 'nested stars expand together' );
muster_acf_assert( $row['matches'][0]['index_path'] === array( 1, 0 ), 'nested index paths are ordered outside in' );
muster_acf_assert( $row['matches'][0]['path'] === 'av_modules.1.slides.0.video_settings.controls_settings', 'nested concrete path' );
muster_acf_assert( $row['matches'][0]['value'] === array( 'play_pause' ), 'nested value' );
muster_acf_assert( $row['skipped'] === array( array( 'index_path' => array( 0 ), 'layout' => 'text' ) ), 'a row without the outer sub-field is skipped once' );

$row = muster_acf_test_run( 'get', array( 'spacing_templates.*.name' ) )['results'][0];
muster_acf_assert( $row['count'] === 2 && $row['skipped'] === array(), 'a repeater star matches every row' );
muster_acf_assert( $row['matches'][1]['value'] === 'Band 60' && $row['matches'][1]['field']['key'] === 'field_st_name', 'repeater matches carry the sub-field key' );

// --- 22. Where a star is not legal, and what it costs to write one. ----------
$row = muster_acf_test_run( 'get', array( 'hero.*' ) )['results'][0];
muster_acf_assert( $row['error'] === "'*' is only valid where a row index is valid.", 'a star on a group is an error' );
muster_acf_assert( $row['exists'] === false, 'an unexpandable pattern does not exist' );
$row = muster_acf_test_run( 'get', array( 'av_modules.0.*' ) )['results'][0];
muster_acf_assert( $row['error'] === "'*' is only valid where a row index is valid.", 'a star cannot index a row' );
$row = muster_acf_test_run( 'get', array( '*.name' ) )['results'][0];
muster_acf_assert( $row['error'] === 'path cannot start with a wildcard.', 'a pattern needs a root' );

$run = muster_acf_test_run( 'preview', array( array( 'path' => 'av_modules.*.section_id', 'value' => 'x' ) ) );
muster_acf_assert( $run['results'][0]['error'] === 'wildcards are read-only', 'preview refuses a pattern' );
muster_acf_test_reset();
$run = muster_acf_test_run(
	'apply',
	array(
		array( 'path' => 'av_modules.0.section_id', 'value' => 'x' ),
		array( 'path' => 'av_modules.*.section_id', 'value' => 'y' ),
	)
);
muster_acf_assert( $run['ok'] === false && $run['apply_skipped'] === true, 'a pattern in an apply skips the batch' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 0, 'a refused pattern writes nothing' );

// --- 23. Matches are capped at 2000 per pattern. -----------------------------
muster_acf_test_reset();
$many = array();
for ( $i = 0; $i < 2100; $i++ ) {
	$many[] = array( 'field_st_name' => 'row' . $i );
}
$MUSTER_DB['options_spacing_templates'] = $many;
$row = muster_acf_test_run( 'get', array( 'spacing_templates.*.name' ) )['results'][0];
muster_acf_assert( $row['count'] === 2000 && $row['truncated'] === true, 'a pattern stops at 2000 matches' );
muster_acf_test_reset();

// --- 24. Append: preview simulates, apply verifies through the re-read. ------
muster_acf_test_reset();
$append = array(
	array(
		'op'     => 'append',
		'path'   => 'av_modules',
		'layout' => 'text',
		'values' => array( 'body' => 'New body', 'section_id' => 'new-id' ),
	),
);
$run = muster_acf_test_rows( 'preview', $append );
$op  = $run['rows'][0];
muster_acf_assert( $op['op'] === 'append' && $op['path'] === 'av_modules', 'the op echoes itself' );
muster_acf_assert( $op['before_count'] === 2 && $op['after_count'] === 3, 'append counts the rows either side' );
muster_acf_assert( $op['row_layouts'] === array( array( 'index' => 2, 'layout' => 'text' ) ), 'append reports only the row it landed on' );
muster_acf_assert( $op['applied'] === false && count( $MUSTER_UPDATE_CALLS ) === 0, 'preview writes no rows' );
muster_acf_assert( $run['revert']['rows'] === array( array( 'op' => 'delete', 'path' => 'av_modules', 'index' => 2 ) ), 'append reverts to a delete' );
foreach ( array( 'trace', 'root_key', 'container', 'revert' ) as $internal ) {
	muster_acf_assert( ! array_key_exists( $internal, $op ), "op internal '{$internal}' stays out of the envelope" );
}

$run = muster_acf_test_rows( 'apply', $append );
$op  = $run['rows'][0];
muster_acf_assert( $op['applied'] === true && $run['apply'] === true, 'append applies' );
muster_acf_assert( $op['after_count'] === 3 && count( $MUSTER_DB['options_av_modules'] ) === 3, 'the new row reached the DB' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][2]['field_av_body'] === 'New body', 'append wrote its values by key' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][2]['acf_fc_layout'] === 'text', 'append set the layout' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][2]['field_av_clone_field_bg'] === 'white', 'ACF fills the sub-fields the op omitted with their defaults' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 1, 'one update_field per root' );
$done = muster_acf_test_rows( 'apply', $run['revert']['rows'] );
muster_acf_assert( $done['rows'][0]['applied'] === true && count( $MUSTER_DB['options_av_modules'] ) === 2, 'the append revert removes the row' );

// --- 25. Layout rules on append and insert. ---------------------------------
muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'append', 'path' => 'av_modules' ) ) );
muster_acf_assert( $run['ok'] === false && $run['apply_skipped'] === true, 'a flex append without a layout skips the batch' );
muster_acf_assert( $run['rows'][0]['error'] === 'av_modules append: layout is required on a flexible field. Layouts: text, quote, media', 'and says which layouts exist' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 0, 'nothing written' );

$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'append', 'path' => 'av_modules', 'layout' => 'nope' ) ) );
muster_acf_assert( $run['rows'][0]['error'] === "av_modules append: unknown layout 'nope'. Layouts: text, quote, media", 'an unknown layout is refused' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'append', 'path' => 'spacing_templates', 'layout' => 'text' ) ) );
muster_acf_assert( $run['rows'][0]['error'] === 'spacing_templates append: layout is not valid on a repeater.', 'a repeater takes no layout' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'append', 'path' => 'spacing_templates', 'values' => array( 'nope' => 1 ) ) ) );
muster_acf_assert( $run['rows'][0]['error'] === "spacing_templates append: unknown sub-field 'nope'. Available: name, bp", 'unknown values are refused' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'append', 'path' => 'spacing_templates', 'values' => array( 'bp' => 'not-a-number' ) ) ) );
muster_acf_assert( strpos( $run['rows'][0]['error'], 'expected a number' ) !== false, 'values go through the coercer' );

// --- 26. Append, insert, delete, move and duplicate on a repeater. -----------
muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'append', 'path' => 'spacing_templates', 'values' => array( 'name' => 'Band 100', 'bp' => 100 ) ) ) );
muster_acf_assert( $run['rows'][0]['applied'] === true, 'repeater append applies' );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][2] === array( 'field_st_name' => 'Band 100', 'field_st_bp' => '100' ), 'repeater append stored both values' );
muster_acf_assert( $run['rows'][0]['row_layouts'] === array( array( 'index' => 2, 'layout' => null ) ), 'a repeater row has a null layout' );

muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'insert', 'path' => 'spacing_templates', 'index' => 0, 'values' => array( 'name' => 'First' ) ) ) );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][0]['field_st_name'] === 'First', 'insert lands at the index' );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][1]['field_st_name'] === 'Band 40', 'insert shifts the rest down' );
muster_acf_assert( $run['revert']['rows'] === array( array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 0 ) ), 'insert reverts to a delete' );

muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'move', 'path' => 'spacing_templates', 'index' => 0, 'to' => 1 ) ) );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][0]['field_st_name'] === 'Band 60', 'move reorders the rows' );
muster_acf_assert( $run['rows'][0]['before_count'] === 2 && $run['rows'][0]['after_count'] === 2, 'move keeps the count' );
muster_acf_assert( $run['revert']['rows'] === array( array( 'op' => 'move', 'path' => 'spacing_templates', 'index' => 1, 'to' => 0 ) ), 'move reverts to the inverse move' );
$done = muster_acf_test_rows( 'apply', $run['revert']['rows'] );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][0]['field_st_name'] === 'Band 40', 'the move revert puts it back' );

muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'duplicate', 'path' => 'spacing_templates', 'index' => 0 ) ) );
muster_acf_assert( count( $MUSTER_DB['options_spacing_templates'] ) === 3, 'duplicate grows the array' );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][1]['field_st_name'] === 'Band 40', 'duplicate lands after the source by default' );
muster_acf_assert( $run['revert']['rows'] === array( array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 1 ) ), 'duplicate reverts to a delete' );
muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'duplicate', 'path' => 'spacing_templates', 'index' => 0, 'to' => 2 ) ) );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][2]['field_st_name'] === 'Band 40', 'duplicate honours to' );

// --- 27. Delete carries the removed row in its revert. ----------------------
muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'delete', 'path' => 'av_modules', 'index' => 0 ) ) );
muster_acf_assert( $run['rows'][0]['after_count'] === 1 && count( $MUSTER_DB['options_av_modules'] ) === 1, 'delete removes the row' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][0]['acf_fc_layout'] === 'media', 'the surviving row moved up' );
$revert = $run['revert']['rows'];
muster_acf_assert(
	$revert === array(
		array(
			'op'     => 'insert',
			'path'   => 'av_modules',
			'index'  => 0,
			'values' => array( 'body' => '<h4>MEDIA</h4>', 'section_id' => '', 'module_bg_colour' => 'white' ),
			'layout' => 'text',
		),
	),
	'delete reverts to an insert of the removed row, name-keyed'
);
$done = muster_acf_test_rows( 'apply', $revert );
muster_acf_assert( $done['rows'][0]['applied'] === true, 'the delete revert applies' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][0]['field_av_body'] === '<h4>MEDIA</h4>', 'the removed row is back where it was' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][0]['field_av_clone_field_bg'] === 'white', 'the clone child came back too' );

// --- 28. Ops reach a container nested inside a flex row. --------------------
muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'append', 'path' => 'av_modules.1.slides' ) ) );
$op  = $run['rows'][0];
muster_acf_assert( $op['before_count'] === 1 && $op['after_count'] === 2, 'a nested repeater grows' );
muster_acf_assert( count( $MUSTER_DB['options_av_modules'][1]['field_av_slides'] ) === 2, 'the nested row reached the DB' );
muster_acf_assert( $op['applied'] === true, 'a nested op verifies through the re-read' );

// --- 29. Ordering: leaf writes land first, then ops in list order. ----------
muster_acf_test_reset();
$run = muster_acf_test_rows(
	'apply',
	array(
		array( 'op' => 'append', 'path' => 'spacing_templates', 'values' => array( 'name' => 'Third' ) ),
		array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 0 ),
	),
	array( array( 'path' => 'spacing_templates.0.name', 'value' => 'Renamed' ) )
);
muster_acf_assert( $run['apply'] === true, 'a mixed batch applies' );
muster_acf_assert( count( $MUSTER_DB['options_spacing_templates'] ) === 2, 'append then delete nets out' );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][0]['field_st_name'] === 'Band 60', 'the delete saw the appended array' );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'][1]['field_st_name'] === 'Third', 'the append survived' );
muster_acf_assert( $run['results'][0]['applied'] === false, 'a leaf write the ops then deleted does not claim to have applied' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 1, 'fields and ops share one write per root' );
muster_acf_assert( count( $run['revert']['rows'] ) === 2, 'both ops revert' );
muster_acf_assert( $run['revert']['rows'][0]['op'] === 'insert', 'reverts come back in reverse order' );

muster_acf_test_reset();
$run = muster_acf_test_rows(
	'apply',
	array( array( 'op' => 'append', 'path' => 'spacing_templates', 'values' => array( 'name' => 'Solo' ) ) ),
	array( array( 'path' => 'band_count', 'value' => 7 ) )
);
muster_acf_assert( count( $run['revert']['fields'] ) === 1 && count( $run['revert']['rows'] ) === 1, 'both halves revert when both applied' );
muster_acf_assert(
	muster_acf_test_has_warning( $run['warnings'], 'send revert.rows first' ),
	'a mixed revert says which half to replay first'
);
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 2, 'two roots take one write each' );
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 2 ) ) );
muster_acf_assert( ! muster_acf_test_has_warning( $run['warnings'], 'send revert.rows first' ), 'a rows-only revert needs no ordering note' );

// --- 30. One bad op stops the whole batch. ---------------------------------
muster_acf_test_reset();
$run = muster_acf_test_rows(
	'apply',
	array(
		array( 'op' => 'append', 'path' => 'spacing_templates', 'values' => array( 'name' => 'Never' ) ),
		array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 9 ),
	),
	array( array( 'path' => 'band_count', 'value' => 7 ) )
);
muster_acf_assert( $run['ok'] === false && $run['apply_skipped'] === true, 'an invalid op skips the batch' );
muster_acf_assert( $run['rows'][1]['error'] === 'spacing_templates delete: index 9 out of range (count=3).', 'the range error counts the array as the ops left it' );
muster_acf_assert( $run['rows'][0]['applied'] === false && $run['rows'][1]['applied'] === false, 'no op claims to have applied' );
muster_acf_assert( count( $MUSTER_UPDATE_CALLS ) === 0 && $MUSTER_DB['options_band_count'] === '60', 'neither the op nor the field write landed' );
muster_acf_assert( $run['revert']['rows'] === array() && $run['revert']['fields'] === array(), 'a skipped batch reverts nothing' );

// --- 31. Paths an op cannot use. -------------------------------------------
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'append', 'path' => 'hero' ) ) );
muster_acf_assert( $run['rows'][0]['error'] === "row operations need a repeater or flexible_content path; 'hero' is a group.", 'a group takes no row ops' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'delete', 'path' => 'av_modules.0', 'index' => 0 ) ) );
muster_acf_assert( $run['rows'][0]['error'] === "row operations address the container, not a row; drop the row index from 'av_modules.0'.", 'a row path names the container instead' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'delete', 'path' => 'av_modules.*.slides', 'index' => 0 ) ) );
muster_acf_assert( $run['rows'][0]['error'] === 'wildcards are read-only', 'an op cannot use a pattern' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'nope', 'path' => 'spacing_templates' ) ) );
muster_acf_assert( $run['rows'][0]['error'] === "'nope' is not a row operation. Valid: append, insert, delete, move, duplicate.", 'unknown ops are named' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'move', 'path' => 'spacing_templates', 'index' => 0 ) ) );
muster_acf_assert( $run['rows'][0]['error'] === 'spacing_templates move: to is required.', 'move needs a destination' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'insert', 'path' => 'spacing_templates', 'values' => array() ) ) );
muster_acf_assert( $run['rows'][0]['error'] === 'spacing_templates insert: index is required.', 'insert needs an index' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'insert', 'path' => 'spacing_templates', 'index' => 3 ) ) );
muster_acf_assert( $run['rows'][0]['error'] === 'spacing_templates insert: index 3 out of range (count=2).', 'insert stops one past the end' );
$run = muster_acf_test_rows( 'preview', array( array( 'op' => 'insert', 'path' => 'spacing_templates', 'index' => 2, 'values' => array( 'name' => 'End' ) ) ) );
muster_acf_assert( ! isset( $run['rows'][0]['error'] ) && $run['rows'][0]['after_count'] === 3, 'insert at the end is an append' );

$run = muster_acf_test_run( 'get', array( 'band_count' ) );
muster_acf_assert( ! isset( $run['rows'] ), 'get carries no rows key' );
$run = muster_acf_run(
	array(
		'mode'   => 'get',
		'target' => array( 'kind' => 'option' ),
		'fields' => array(),
		'rows'   => array( array( 'op' => 'append', 'path' => 'spacing_templates' ) ),
	)
);
muster_acf_assert( $run['ok'] === false && $run['error'] === 'row operations need preview or apply.', 'get refuses row ops' );

// --- 32. apply says writes were issued; applied says they verified. ---------
muster_acf_test_reset();
$MUSTER_REJECT_WRITES = array( 'field_bc' );
$run = muster_acf_test_run( 'apply', array( array( 'path' => 'band_count', 'value' => 7 ) ) );
muster_acf_assert( $run['apply'] === true, 'apply is true because the write was issued' );
muster_acf_assert( $run['results'][0]['applied'] === false, 'applied is false because the re-read did not match' );
muster_acf_assert(
	muster_acf_test_has_warning( $run['warnings'], 'write issued but the re-read did not match: band_count' ),
	'a mismatch names the path'
);
muster_acf_assert( $run['revert']['fields'] === array(), 'an unverified write is left out of the revert' );

muster_acf_test_reset();
$MUSTER_REJECT_WRITES = array( 'field_av' );
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'append', 'path' => 'av_modules', 'layout' => 'text' ) ) );
muster_acf_assert( $run['apply'] === true && $run['rows'][0]['applied'] === false, 'an op that did not stick still reports the write' );
muster_acf_assert( muster_acf_test_has_warning( $run['warnings'], 'write issued but the re-read did not match: av_modules' ), 'the op mismatch names its path' );

// --- 33. A new row is verified as a subset of what ACF stored. --------------
muster_acf_test_reset();
$run = muster_acf_test_rows( 'apply', array( array( 'op' => 'append', 'path' => 'av_modules', 'layout' => 'text', 'values' => array( 'body' => 'ONE' ) ) ) );
muster_acf_assert( $run['rows'][0]['applied'] === true, 'a row carrying one value verifies against a row ACF filled' );
muster_acf_assert( $MUSTER_DB['options_av_modules'][2]['field_av_clone_field_bg'] === 'white', 'ACF filled the rest with defaults' );
muster_acf_assert( count( $run['revert']['rows'] ) === 1, 'and the op reverts' );

$container = array(
	'type'       => 'repeater',
	'sub_fields' => array( array( 'key' => 'field_a', 'name' => 'a', 'type' => 'text' ) ),
);
muster_acf_assert(
	muster_acf_rows_match( $container, array( array( 'field_a' => 'x' ) ), array( array( 'field_a' => 'x', 'field_b' => 'filled' ) ) ),
	'extra stored keys do not fail the match'
);
muster_acf_assert(
	! muster_acf_rows_match( $container, array( array( 'field_a' => 'x' ) ), array( array( 'field_a' => 'y' ) ) ),
	'a changed value still fails the match'
);
muster_acf_assert(
	! muster_acf_rows_match( $container, array( array( 'field_a' => 'x' ) ), array( array( 'field_a' => 'x' ), array( 'field_a' => 'z' ) ) ),
	'a different row count still fails the match'
);

// --- 34. Each op reports its own counts. -----------------------------------
muster_acf_test_reset();
$MUSTER_DB['options_spacing_templates'] = array(
	array( 'field_st_name' => 'r0' ),
	array( 'field_st_name' => 'r1' ),
	array( 'field_st_name' => 'r2' ),
	array( 'field_st_name' => 'r3' ),
);
$run = muster_acf_test_rows(
	'apply',
	array(
		array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 0 ),
		array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 0 ),
		array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 0 ),
		array( 'op' => 'delete', 'path' => 'spacing_templates', 'index' => 0 ),
	)
);
$counts = array();
foreach ( $run['rows'] as $op_row ) {
	$counts[] = $op_row['before_count'] . '->' . $op_row['after_count'];
}
muster_acf_assert( $counts === array( '4->3', '3->2', '2->1', '1->0' ), 'four deletes count down one at a time' );
muster_acf_assert( $MUSTER_DB['options_spacing_templates'] === array(), 'and the field ends empty' );
muster_acf_assert( $run['rows'][0]['row_layouts'] === array(), 'a delete reports no touched row' );

// --- 35. Describe strips label markup and caps the length. -----------------
$described = muster_acf_describe_subfields(
	array(
		array(
			'name'    => 'swatch',
			'type'    => 'radio',
			'label'   => '<span class="swatch" style="background:#fff"></span>  White ',
			'choices' => array( 'white' => '<span class="swatch" style="background:#fff"></span> White' ),
		),
		array( 'name' => 'wordy', 'type' => 'text', 'label' => str_repeat( 'long ', 40 ) ),
	)
);
muster_acf_assert( $described[0]['label'] === 'White', 'a label loses its markup' );
muster_acf_assert( $described[0]['choices']['white'] === 'White', 'a choice label loses its markup' );
muster_acf_assert( strlen( $described[1]['label'] ) === 80, 'a long label is cut to 80' );
muster_acf_assert( substr( $described[1]['label'], -3 ) === '...', 'and says it was cut' );
muster_acf_assert( muster_acf_short_label( 'é' . str_repeat( 'x', 100 ) ) !== false, 'a multibyte label survives the cut' );
muster_acf_assert( json_encode( muster_acf_short_label( str_repeat( 'é', 100 ) ) ) !== false, 'and stays encodable' );

muster_acf_test_reset();
muster_acf_assert( $MUSTER_FORMATTED_READS === 0, 'never reads formatted values' );

fwrite( STDOUT, "ok\n" );
exit( 0 );
