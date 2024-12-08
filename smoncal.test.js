/**
 * @jest-environment jsdom
 */

test('Check create of new calculation line', () => {
	document.body.innerHTML = `<calc-sheet id="sheet">
			<calc-line contenteditable>Here wego </calc-line>
		</calc-sheet>
		<button onclick="add_calc_line()" id="add_calc_line">Add line</button>
		`;

	require('./smoncal.js')

	const addLineButton = document.getElementById('add_calc_line'); 
	const sheet = document.getElementById('sheet');
	const lines = sheet.getElementsByTagName('calc-line'); 
	const line_amount = lines.length;
	addLineButton.click(); 
	
	let lines_now = lines.length;
	let target_amount = line_amount + 1; 
	expect(lines_now).toBe(target_amount); 
}); 
