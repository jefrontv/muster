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

fwrite( STDOUT, "ok\n" );
exit( 0 );
