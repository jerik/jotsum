/** Add a new calculation line **/
function add_calc_line() {
	const cline = document.createElement('nr-line');
	cline.setAttribute('contenteditable', 'true'); 
	const csheet = document.getElementById('sheet');
	console.log(csheet);
	csheet.appendChild(cline); 
}
