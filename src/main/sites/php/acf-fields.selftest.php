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
for ( $i = 0; $i < 10; $i++ ) {
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

fwrite( STDOUT, "ok\n" );
exit( 0 );
